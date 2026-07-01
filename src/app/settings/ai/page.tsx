"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, ArrowLeft, Trash2, Play, Plus } from "lucide-react";
import { toast } from "sonner";

// Settings > IA (b6-ui-agentes, version reducida). CRUD de ai_agents + "Probar"
// (corre el copiloto con el rol del agente como system prompt). Un agente puede
// usarse tambien como prompt de un ai_step en el workflow engine (nota abajo).

interface Agent {
  id: string;
  name: string;
  role: string;
  tools: string; // JSON array de nombres
  created_at: number;
}

// Tools disponibles del copiloto (fijas; ver src/lib/ai/tools.ts).
const ALL_TOOLS = [
  "query_records",
  "get_record",
  "count_records",
  "search",
  "propose_update",
  "propose_create",
];

function parseTools(raw: string): string[] {
  try {
    const t = JSON.parse(raw);
    return Array.isArray(t) ? t.map(String) : [];
  } catch {
    return [];
  }
}

export default function SettingsAIPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editing, setEditing] = useState<{ id?: string; name: string; role: string; tools: string[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testInput, setTestInput] = useState("cuantas oportunidades en el radar?");
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const load = () =>
    fetch("/api/ai/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAgents(Array.isArray(d) ? d : []))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const startNew = () => setEditing({ name: "", role: "", tools: [...ALL_TOOLS] });
  const startEdit = (a: Agent) => setEditing({ id: a.id, name: a.name, role: a.role, tools: parseTools(a.tools) });

  const toggleTool = (tool: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      tools: editing.tools.includes(tool) ? editing.tools.filter((t) => t !== tool) : [...editing.tools, tool],
    });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.role.trim()) {
      toast.error("Nombre y rol son requeridos");
      return;
    }
    const res = await fetch("/api/ai/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      toast.success("Agente guardado");
      setEditing(null);
      load();
    } else {
      toast.error("No se pudo guardar");
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/ai/agents?id=${id}`, { method: "DELETE" });
    setAgents((as) => as.filter((a) => a.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const test = async () => {
    if (!editing || testing) return;
    setTesting(true);
    setTestOutput(null);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: testInput }], system: editing.role, tools: editing.tools }),
      });
      const data = await res.json();
      setTestOutput(res.ok ? String(data.answer ?? "") : `Error: ${data?.error ?? "desconocido"}`);
    } catch (e) {
      setTestOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-5 w-5" /> Agentes IA
          </h1>
          <p className="text-muted-foreground">
            Definí agentes con un rol y tools. Un agente también sirve como prompt de un paso IA en Automatizaciones.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Agentes</CardTitle>
            <Button size="sm" onClick={startNew} className="cursor-pointer">
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {agents.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay agentes.</p>}
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.role}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {parseTools(a.tools).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => startEdit(a)}>
                  Editar
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                  onClick={() => remove(a.id)}
                  aria-label={`Borrar ${a.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing?.id ? "Editar agente" : "Nuevo agente"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!editing ? (
              <p className="text-sm text-muted-foreground">Seleccioná un agente o creá uno nuevo.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nombre</label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ej. Analista de pipeline"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Rol (system prompt)</label>
                  <textarea
                    value={editing.role}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    rows={4}
                    placeholder="Sos un analista que prioriza deals por probabilidad y propone próximos pasos..."
                    className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tools permitidas</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_TOOLS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTool(t)}
                        className={`text-xs px-2 py-1 rounded-md border cursor-pointer transition-colors ${
                          editing.tools.includes(t)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={save} className="cursor-pointer">
                    Guardar
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)} className="cursor-pointer">
                    Cancelar
                  </Button>
                </div>

                {/* Probar */}
                <div className="space-y-2 pt-2 border-t">
                  <label className="text-sm font-medium">Probar</label>
                  <div className="flex gap-2">
                    <Input value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="Pregunta de prueba" />
                    <Button onClick={test} disabled={testing} variant="outline" className="cursor-pointer shrink-0">
                      <Play className="h-4 w-4" /> {testing ? "..." : "Probar"}
                    </Button>
                  </div>
                  {testOutput !== null && (
                    <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{testOutput}</div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
