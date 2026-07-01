// Prevents an extra console window on Windows in release. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent};

/// Puerto local donde corre el server Next embebido. Elegido alto y poco comun
/// para no chocar con instancias de dev (3000/3030) ni prod (3001).
const PORT: u16 = 4555;

/// Guarda el proceso hijo (server Next) para poder matarlo al cerrar la app.
struct ServerState(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(ServerState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            // Booteamos el server en un hilo aparte para no bloquear la UI:
            // mostramos el splash de inmediato y navegamos a la app cuando responde.
            std::thread::spawn(move || boot_server(&handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error al construir la app Tauri")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

fn boot_server(app: &AppHandle) {
    let window = app.get_webview_window("main");

    let node = match find_node() {
        Some(n) => n,
        None => {
            show_error(
                app,
                "No se encontro Node.js. Instala Node 24+ (brew install node) y volve a abrir la app.",
            );
            return;
        }
    };

    let server_dir = match find_server_dir(app) {
        Some(d) => d,
        None => {
            show_error(
                app,
                "No se encontro el server embebido. Reconstrui con: npm run desktop:build.",
            );
            return;
        }
    };

    // Carpeta de datos escribible del usuario. El server standalone hace
    // process.chdir(__dirname) y ese dir es de SOLO LECTURA dentro del .app, asi
    // que toda escritura (DB, uploads, recovery) debe ir aca via CRM_DATA_DIR.
    let data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => server_dir.join("data"),
    };
    let _ = std::fs::create_dir_all(&data_dir);
    let db_path = data_dir.join("crm.db");

    let mut cmd = Command::new(&node);
    cmd.arg("server.js")
        .current_dir(&server_dir)
        .env("PORT", PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("CRM_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("CRM_DB_PATH", db_path.to_string_lossy().to_string());

    // Cifrado en reposo (SQLCipher): la llave vive en el Keychain de macOS, no al
    // lado de la DB. Se lee/crea aca y se le pasa al server por env (CRM_DB_KEY),
    // que la aplica al abrir crm.db (ver src/lib/db-open.ts). Si no se puede
    // obtener/persistir la llave, arrancamos sin cifrado en vez de brickear.
    if let Some(key) = get_or_create_db_key() {
        cmd.env("CRM_DB_KEY", key);
    }

    let child = cmd.spawn();

    match child {
        Ok(c) => {
            if let Some(state) = app.try_state::<ServerState>() {
                if let Ok(mut guard) = state.0.lock() {
                    *guard = Some(c);
                }
            }
        }
        Err(e) => {
            show_error(app, &format!("No se pudo iniciar el server: {e}"));
            return;
        }
    }

    if wait_for_port(PORT, Duration::from_secs(60)) {
        if let Some(win) = window {
            if let Ok(url) = format!("http://127.0.0.1:{PORT}").parse::<tauri::Url>() {
                let _ = win.navigate(url);
            }
        }
    } else {
        show_error(
            app,
            "El server no respondio a tiempo. Revisa los logs o reabri la app.",
        );
    }
}

/// Service/account de la llave de cifrado en el Keychain. Coincide con el
/// identifier de la app (tauri.conf.json) y con lo que lee src/lib/db-open.ts.
const KEYCHAIN_SERVICE: &str = "io.niuro.crm";
const KEYCHAIN_ACCOUNT: &str = "db-key";

/// Llave de cifrado de la DB (hex de 32 bytes). La lee del Keychain de macOS; si
/// no existe, genera una y la guarda. Devuelve None si no se puede obtener ni
/// persistir (ej. no-macOS o acceso denegado): en ese caso el server arranca sin
/// cifrado, igual que hoy, en vez de dejar la DB inaccesible.
///
/// Usa el CLI `security` en vez de un crate de Keychain: cero dependencias
/// nuevas, cero cambios en Cargo.lock, y el mismo mecanismo que el fallback de
/// Node para los scripts (`security find-generic-password`).
fn get_or_create_db_key() -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    if let Some(k) = keychain_read_key() {
        return Some(k);
    }
    let key = random_hex_32()?;
    if keychain_write_key(&key) {
        Some(key)
    } else {
        // No se pudo persistir: no arriesgar una llave efimera que bloquearia la
        // DB en el proximo arranque. Degradar a sin-cifrado.
        None
    }
}

/// Lee la llave del Keychain. None si la entrada no existe o `security` falla.
fn keychain_read_key() -> Option<String> {
    let out = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let key = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

/// Guarda (o actualiza, -U) la llave en el Keychain. true si quedo persistida.
fn keychain_write_key(key: &str) -> bool {
    Command::new("security")
        .args([
            "add-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
            key,
            "-U",
        ])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// 32 bytes de /dev/urandom, en hex (64 chars). None si no se puede leer.
fn random_hex_32() -> Option<String> {
    use std::io::Read;
    let mut f = std::fs::File::open("/dev/urandom").ok()?;
    let mut buf = [0u8; 32];
    f.read_exact(&mut buf).ok()?;
    let mut s = String::with_capacity(64);
    for b in buf {
        s.push_str(&format!("{b:02x}"));
    }
    Some(s)
}

/// Busca un binario de node usable. Importante en macOS: las apps lanzadas desde
/// Finder reciben un PATH minimo que NO incluye /opt/homebrew/bin ni /usr/local/bin,
/// donde Homebrew instala node. Por eso probamos rutas explicitas ademas del PATH.
fn find_node() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("NIURO_NODE_BIN") {
        let pb = PathBuf::from(p);
        if works(&pb) {
            return Some(pb);
        }
    }
    let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
        "node",
    ];
    for c in candidates {
        let pb = PathBuf::from(c);
        if works(&pb) {
            return Some(pb);
        }
    }
    // Version managers (nvm, fnm, volta, asdf): el binario no esta en un PATH fijo.
    // Le preguntamos al shell de login del usuario, que carga su profile donde el
    // manager se configura. Cubre cualquiera de ellos sin enumerar rutas.
    if let Some(pb) = node_from_login_shell() {
        return Some(pb);
    }
    // Fallback directo a nvm por si el shell no resolvio (ej. nvm lazy-load).
    node_from_nvm()
}

/// Resuelve `node` via el shell de login+interactivo del usuario (carga ~/.zshrc
/// donde vive nvm/fnm/etc.). Toma la ultima linea no vacia de stdout.
fn node_from_login_shell() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = Command::new(&shell)
        .args(["-lic", "command -v node"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let path = stdout.lines().rev().map(str::trim).find(|l| !l.is_empty())?;
    let pb = PathBuf::from(path);
    if works(&pb) {
        Some(pb)
    } else {
        None
    }
}

/// Fallback: nvm instala en ~/.nvm/versions/node/<ver>/bin/node. Toma la version
/// mas alta (orden lexical) que funcione.
// ponytail: orden lexical, no semver puro; alcanza para arrancar con un node usable.
fn node_from_nvm() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home).join(".nvm/versions/node");
    let mut versions: Vec<PathBuf> = std::fs::read_dir(&dir)
        .ok()?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    versions.sort();
    for v in versions.into_iter().rev() {
        let pb = v.join("bin/node");
        if works(&pb) {
            return Some(pb);
        }
    }
    None
}

fn works(node: &PathBuf) -> bool {
    Command::new(node)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Resuelve el directorio del server standalone embebido. Soporta override por
/// env, las distintas ubicaciones posibles del resource_dir, y un fallback de dev.
fn find_server_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("NIURO_SERVER_DIR") {
        let pb = PathBuf::from(p);
        if pb.join("server.js").exists() {
            return Some(pb);
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        for sub in ["server", "resources/server"] {
            let d = res.join(sub);
            if d.join("server.js").exists() {
                return Some(d);
            }
        }
    }
    // Fallback de desarrollo: el build standalone dentro del repo.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.next/standalone");
    if dev.join("server.js").exists() {
        return Some(dev);
    }
    None
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

fn show_error(app: &AppHandle, msg: &str) {
    if let Some(win) = app.get_webview_window("main") {
        let safe = msg.replace('\\', "\\\\").replace('\'', "\\'");
        let js = format!(
            "var e=document.getElementById('msg'); if(e){{e.textContent='{safe}';}} var s=document.getElementById('spinner'); if(s){{s.style.display='none';}}"
        );
        let _ = win.eval(&js);
    }
}
