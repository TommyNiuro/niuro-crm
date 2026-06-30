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

    // DB en una carpeta escribible del usuario (el .app es de solo lectura).
    let db_path = match app.path().app_data_dir() {
        Ok(dir) => {
            let _ = std::fs::create_dir_all(&dir);
            dir.join("crm.db")
        }
        Err(_) => server_dir.join("data").join("crm.db"),
    };

    let child = Command::new(&node)
        .arg("server.js")
        .current_dir(&server_dir)
        .env("PORT", PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("CRM_DB_PATH", db_path.to_string_lossy().to_string())
        .spawn();

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
