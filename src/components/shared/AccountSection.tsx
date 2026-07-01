"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Cambiar contraseña + cerrar cuenta (una sola cuenta por instalación, ver
// src/lib/auth.ts). Cerrar cuenta NO borra datos de negocio, solo la
// credencial y las sesiones — se lo dice explícito al usuario en la UI.
export function AccountSection() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [closePassword, setClosePassword] = useState("");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closing, setClosing] = useState(false);

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/auth/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo cambiar la contraseña");
      toast.success("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  const closeAccount = async () => {
    setClosing(true);
    try {
      const r = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: closePassword }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo cerrar la cuenta");
      router.push("/setup-account");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cerrar la cuenta");
      setClosing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Cambiar contraseña</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            type="password"
            placeholder="Contraseña actual"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Nueva contraseña"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={changePassword}
          disabled={saving || !currentPassword || !newPassword}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          Actualizar contraseña
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
        <p className="text-xs font-medium text-destructive">Cerrar cuenta</p>
        <p className="text-[11px] text-muted-foreground">
          Borra tu email/contraseña de esta instalación. Tus contactos, deals y demás datos NO se
          borran — solo perdés el acceso hasta crear una cuenta nueva.
        </p>
        {!confirmingClose ? (
          <Button size="sm" variant="destructive" onClick={() => setConfirmingClose(true)}>
            Cerrar cuenta
          </Button>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="close-pw" className="text-[11px]">
              Confirmá tu contraseña
            </Label>
            <Input
              id="close-pw"
              type="password"
              value={closePassword}
              onChange={(e) => setClosePassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={closeAccount} disabled={closing || !closePassword}>
                {closing ? <Loader2 className="animate-spin" /> : null}
                Confirmar cierre
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingClose(false)} disabled={closing}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
