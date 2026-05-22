import { useState, useEffect, useRef } from "react";

// ── CONFIG — variables de entorno (se configuran en Vercel) ──
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const COACH_PASSWORD = import.meta.env.VITE_COACH_PASSWORD || "joseleiro2024";

// ── THEME ─────────────────────────────────────────────────────
const G = "#C9A84C"; const GL = "#E8C96A";
const GD = "rgba(201,168,76,0.12)"; const GB = "rgba(201,168,76,0.22)";
const BG = "#060606"; const SF = "rgba(255,255,255,0.04)";

// ── FOOD IMAGE LIBRARY ────────────────────────────────────────
const FOOD_IMAGES = {
  "desayuno": "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&q=80",
  "tostadas": "https://images.unsplash.com/photo-1541519227354-08fa5d50c820?w=400&q=80",
  "huevos": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&q=80",
  "avena": "https://images.unsplash.com/photo-1571748982800-fa51082c2224?w=400&q=80",
  "batido": "https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&q=80",
  "pollo": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&q=80",
  "ensalada": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80",
  "salmon": "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&q=80",
  "pasta": "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=400&q=80",
  "arroz": "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=400&q=80",
  "carne": "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?w=400&q=80",
  "verduras": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80",
  "fruta": "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=400&q=80",
  "yogur": "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&q=80",
  "proteina": "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400&q=80",
  "snack": "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80",
  "default": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80",
};

function getFoodImage(mealName) {
  const n = mealName.toLowerCase();
  for (const [key, url] of Object.entries(FOOD_IMAGES)) {
    if (n.includes(key)) return url;
  }
  return FOOD_IMAGES.default;
}

// ── SUPABASE HELPERS ──────────────────────────────────────────
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": opts.prefer || "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Supabase error"); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const db = {
  getClients: () => sb("clients?order=name&is_active=eq.true"),
  getClient: (id) => sb(`clients?id=eq.${id}`).then(r => r[0]),
  createClient: (data) => sb("clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id, data) => sb(`clients?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getMeasurements: (clientId) => sb(`measurements?client_id=eq.${clientId}&order=date.desc`),
  addMeasurement: (data) => sb("measurements", { method: "POST", body: JSON.stringify(data) }),
  getPlans: (clientId) => sb(`meal_plans?client_id=eq.${clientId}&order=start_date.desc`),
  createPlan: (data) => sb("meal_plans", { method: "POST", body: JSON.stringify(data) }).then(r => r[0]),
  updatePlan: (id, data) => sb(`meal_plans?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getPlanDays: (planId) => sb(`plan_days?plan_id=eq.${planId}&order=day_number`),
  createPlanDay: (data) => sb("plan_days", { method: "POST", body: JSON.stringify(data) }).then(r => r[0]),
  getMeals: (planDayId) => sb(`meals?plan_day_id=eq.${planDayId}&order=meal_order`),
  createMeal: (data) => sb("meals", { method: "POST", body: JSON.stringify(data) }).then(r => r[0]),
  updateMeal: (id, data) => sb(`meals?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteMeal: (id) => sb(`meals?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  getIngredients: (mealId) => sb(`meal_ingredients?meal_id=eq.${mealId}`),
  createIngredient: (data) => sb("meal_ingredients", { method: "POST", body: JSON.stringify(data) }),
  deleteIngredients: (mealId) => sb(`meal_ingredients?meal_id=eq.${mealId}`, { method: "DELETE", prefer: "return=minimal" }),
  getChecks: (clientId) => sb(`meal_checks?client_id=eq.${clientId}&order=checked_at.desc`),
};

// ── AI HELPERS ────────────────────────────────────────────────
async function callAI(prompt, system = "") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system: system || "Eres el asistente nutricional de José Leiro Elite Coach. Responde siempre en español. Cuando generes planes nutricionales, sé muy específico con cantidades, ingredientes y recetas.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.map(b => b.text || "").join("") || "";
}

async function generateMealPlan(client, numMeals, prompt, weeks) {
  const clientInfo = `
Cliente: ${client.name}
Género: ${client.gender || "No especificado"}
Edad: ${client.birth_date ? new Date().getFullYear() - new Date(client.birth_date).getFullYear() : "No especificado"}
País: ${client.country || "No especificado"}
Peso: ${client.weight_kg || "No especificado"} kg
Altura: ${client.height_cm || "No especificado"} cm
Objetivo: ${client.goal || "No especificado"}
Notas: ${client.notes || "Ninguna"}`;

  const fullPrompt = `${prompt}

DATOS DEL CLIENTE:
${clientInfo}

Genera un plan nutricional de ${weeks} semanas con ${numMeals} comidas al día.
Responde SOLO con JSON válido, sin texto adicional, con esta estructura exacta:
{
  "plan_title": "Nombre del plan",
  "total_calories": 2000,
  "protein_g": 150,
  "carbs_g": 200,
  "fat_g": 70,
  "weeks": [
    {
      "week_number": 1,
      "days": [
        {
          "day_number": 1,
          "meals": [
            {
              "meal_order": 1,
              "name": "Desayuno",
              "time_of_day": "08:00",
              "description": "Descripción del plato",
              "calories": 400,
              "protein_g": 30,
              "carbs_g": 40,
              "fat_g": 15,
              "recipe": "Instrucciones de preparación paso a paso",
              "ingredients": [
                { "name": "Avena", "quantity": "80", "unit": "g", "food_group": "Cereales" },
                { "name": "Leche desnatada", "quantity": "200", "unit": "ml", "food_group": "Lácteos" }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;

      const totalDays = weeks * 7;
  const dayNames = ["Lunes","Martes","Miercoles","Jueves","Viernes","Sabado","Domingo"];

  const allDays = [];
  for (let i = 0; i < totalDays; i++) {
    const d = i + 1;
    const dayName = dayNames[i % 7];
      const dayPrompt = `${fullPrompt}\n\nGenera SOLO el dia ${d} (${dayName}) con 5 comidas. Responde UNICAMENTE con este JSON sin texto extra: {"day":${d},"day_name":"${dayName}","meals":[{"meal_type":"Desayuno","name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"recipe":"...","ingredients":[{"name":"...","quantity":0,"unit":"g"}]},{"meal_type":"Media manana","name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"recipe":"...","ingredients":[{"name":"...","quantity":0,"unit":"g"}]},{"meal_type":"Comida","name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"recipe":"...","ingredients":[{"name":"...","quantity":0,"unit":"g"}]},{"meal_type":"Merienda","name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"recipe":"...","ingredients":[{"name":"...","quantity":0,"unit":"g"}]},{"meal_type":"Cena","name":"...","calories":0,"protein":0,"carbs":0,"fat":0,"recipe":"...","ingredients":[{"name":"...","quantity":0,"unit":"g"}]}]}`;
    const raw = await callAI(dayPrompt);
    const clean = raw.replace(/```json|```/g, "").trim();
    const match = clean.match(/{[\s\S]*}/);
    allDays.push(JSON.parse(match ? match[0] : clean));
    if (i < totalDays - 1) await new Promise(r => setTimeout(r, 15000));
  }
  return {plan_title: "Plan Nutricional", total_calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70, weeks: Array.from({length: weeks}, (_, i) => ({week_number: i+1, days: allDays.slice(i*7, (i+1)*7)}))};
}

// ── STYLE HELPERS ──────────────────────────────────────────────
const iS = { width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${GB}`, borderRadius: 3, color: "#fff", padding: "10px 13px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const btnPrimary = { background: `linear-gradient(135deg,${G},#a8852e)`, border: "none", color: "#060606", padding: "11px 20px", borderRadius: 3, cursor: "pointer", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", fontWeight: "bold", fontFamily: "inherit" };
const btnGhost = { background: GD, border: `1px solid ${GB}`, color: GL, padding: "9px 16px", borderRadius: 3, cursor: "pointer", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontFamily: "inherit" };

function Label({ children }) { return <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", marginBottom: 5 }}>{children}</div>; }
function Card({ children, style }) { return <div style={{ background: SF, border: `1px solid ${GB}`, borderRadius: 4, padding: 16, ...style }}>{children}</div>; }
function GoldLine() { return <div style={{ width: 36, height: 1, background: G, margin: "12px auto" }} />; }

// ── LOGIN ─────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  function submit() { if (pw === COACH_PASSWORD) onLogin(); else setErr("Contraseña incorrecta"); }
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Palatino Linotype, serif" }}>
      <div style={{ background: "#0c0c0c", border: `1px solid ${GB}`, borderRadius: 4, padding: "44px 32px", maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", border: `1.5px solid ${G}`, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontSize: 12, letterSpacing: 1, margin: "0 auto 16px" }}>JL</div>
        <div style={{ color: G, fontSize: 9, letterSpacing: 5, textTransform: "uppercase", marginBottom: 4 }}>José Leiro</div>
        <div style={{ color: "#fff", fontSize: 19, letterSpacing: 2, marginBottom: 4 }}>Panel de Coach</div>
        <GoldLine />
        <input type="password" placeholder="Contraseña del coach" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} style={{ ...iS, marginBottom: 12, textAlign: "center" }} />
        {err && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>{err}</div>}
        <button onClick={submit} style={{ ...btnPrimary, width: "100%" }}>Entrar</button>
      </div>
    </div>
  );
}

// ── CLIENT LIST ───────────────────────────────────────────────
function ClientList({ onSelect, onNew }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { db.getClients().then(setClients).finally(() => setLoading(false)); }, []);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ color: G, fontSize: 9, letterSpacing: 4, textTransform: "uppercase" }}>José Leiro Elite Coach</div>
          <div style={{ color: "#fff", fontSize: 18, letterSpacing: 1, marginTop: 2 }}>Mis Clientes</div>
        </div>
        <button onClick={onNew} style={btnPrimary}>+ Nuevo</button>
      </div>
      {loading ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 40 }}>Cargando...</div> :
        clients.length === 0 ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", padding: 40, lineHeight: 2 }}>Sin clientes aún.<br />Añade tu primer cliente.</div> :
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clients.map(c => (
              <div key={c.id} onClick={() => onSelect(c)} style={{ background: SF, border: `1px solid ${GB}`, borderRadius: 4, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: GD, border: `1px solid ${GB}`, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontSize: 14, fontWeight: "bold", flexShrink: 0 }}>
                  {c.name?.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: 14 }}>{c.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{c.email}</div>
                </div>
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18 }}>›</div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ── NEW CLIENT FORM ───────────────────────────────────────────
function NewClientForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", gender: "", birth_date: "", country: "España", city: "", weight_kg: "", height_cm: "", goal: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    if (!form.name || !form.email) return;
    setSaving(true);
    try { await db.createClient(form); onSave(); }
    catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  }
  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ ...btnGhost, padding: "8px 12px" }}>← Volver</button>
        <div style={{ color: "#fff", fontSize: 16, letterSpacing: 1 }}>Nuevo Cliente</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <div style={{ color: G, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>Datos Personales</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["name", "Nombre completo *", "text"], ["email", "Email *", "email"], ["phone", "Teléfono", "text"], ["birth_date", "Fecha nacimiento", "date"], ["country", "País", "text"], ["city", "Ciudad", "text"]].map(([k, l, t]) => (
              <div key={k} style={{ gridColumn: k === "name" || k === "email" ? "1 / -1" : "auto" }}>
                <Label>{l}</Label>
                <input type={t} value={form[k]} onChange={e => set(k, e.target.value)} style={iS} />
              </div>
            ))}
            <div>
              <Label>Género</Label>
              <select value={form.gender} onChange={e => set("gender", e.target.value)} style={{ ...iS }}>
                <option value="">Seleccionar</option>
                <option value="Masculino">Masculino</option>
                <option value="Femenino">Femenino</option>
              </select>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ color: G, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>Medidas Iniciales</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>Peso (kg)</Label><input type="number" value={form.weight_kg} onChange={e => set("weight_kg", e.target.value)} style={iS} /></div>
            <div><Label>Altura (cm)</Label><input type="number" value={form.height_cm} onChange={e => set("height_cm", e.target.value)} style={iS} /></div>
          </div>
        </Card>
        <Card>
          <div style={{ color: G, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>Objetivo y Notas</div>
          <div><Label>Objetivo del cliente</Label><input value={form.goal} onChange={e => set("goal", e.target.value)} placeholder="Perder peso, ganar músculo..." style={{ ...iS, marginBottom: 10 }} /></div>
          <div><Label>Notas internas</Label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3} style={{ ...iS, resize: "vertical" }} /></div>
        </Card>
        <button onClick={save} disabled={saving} style={{ ...btnPrimary, width: "100%", padding: 13 }}>{saving ? "Guardando..." : "Crear Cliente"}</button>
      </div>
    </div>
  );
}

// ── CLIENT DETAIL ─────────────────────────────────────────────
function ClientDetail({ client, onBack }) {
  const [tab, setTab] = useState("plans");
  const tabs = [{ id: "plans", l: "📋 Planes" }, { id: "checks", l: "✅ Checks" }, { id: "measurements", l: "📏 Mediciones" }];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${GB}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ ...btnGhost, padding: "7px 12px", fontSize: 12 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontSize: 15 }}>{client.name}</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 1 }}>{client.goal || "Sin objetivo definido"}</div>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${GB}`, flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 4px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: `2px solid ${tab === t.id ? G : "transparent"}`, color: tab === t.id ? G : "rgba(255,255,255,0.3)", fontSize: 11 }}>{t.l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "plans" && <PlansTab client={client} />}
        {tab === "checks" && <ChecksTab client={client} />}
        {tab === "measurements" && <MeasurementsTab client={client} />}
      </div>
    </div>
  );
}

// ── PLANS TAB ──────────────────────────────────────────────────
function PlansTab({ client }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genForm, setGenForm] = useState({ numMeals: 5, weeks: 4, prompt: "" });

  useEffect(() => { db.getPlans(client.id).then(setPlans).finally(() => setLoading(false)); }, [client.id]);

  async function generatePlan() {
    if (!genForm.prompt.trim()) return;
    setGenLoading(true);
    try {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + genForm.weeks * 7);
      const plan = await generateMealPlan(client, genForm.numMeals, genForm.prompt, genForm.weeks);
      const saved = await db.createPlan({
        client_id: client.id,
        title: plan.plan_title,
        month_year: new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        total_calories: plan.total_calories,
        protein_g: plan.protein_g,
        carbs_g: plan.carbs_g,
        fat_g: plan.fat_g,
        is_published: false,
      });

      let dayNum = 1;
      for (const week of plan.weeks) {
        for (const day of week.days) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + dayNum - 1);
          const savedDay = await db.createPlanDay({ plan_id: saved.id, day_number: dayNum, date: d.toISOString().split("T")[0] });
          for (const meal of day.meals) {
            const imgUrl = getFoodImage(meal.name);
            const savedMeal = await db.createMeal({ plan_day_id: savedDay.id, meal_order: Array.from(day.meals).indexOf(meal) + 1, name: meal.name, time_of_day: meal.time_of_day, description: meal.description, image_url: imgUrl, calories: meal.calories, protein_g: meal.protein_g || meal.protein || 0, carbs_g: meal.carbs_g || meal.carbs || 0, fat_g: meal.fat_g || meal.fat || 0, recipe: meal.recipe });
            for (const ing of meal.ingredients || []) {
              await db.createIngredient({ meal_id: savedMeal.id, name: ing.name, quantity: ing.quantity, unit: ing.unit, food_group: ing.food_group });
            }
          }
          dayNum++;
        }
      }
      const updated = await db.getPlans(client.id);
      setPlans(updated);
      setCreating(false);
      alert("✅ Plan generado correctamente. Puedes editarlo antes de publicarlo.");
    } catch (e) { alert("Error generando plan: " + e.message); }
    finally { setGenLoading(false); }
  }

  async function publishPlan(planId, current) {
    await db.updatePlan(planId, { is_published: !current });
    setPlans(p => p.map(pl => pl.id === planId ? { ...pl, is_published: !current } : pl));
  }

  if (selectedPlan) return <PlanEditor plan={selectedPlan} onBack={() => setSelectedPlan(null)} />;

  return (
    <div style={{ padding: 14 }}>
      {!creating ? (
        <button onClick={() => setCreating(true)} style={{ ...btnPrimary, width: "100%", marginBottom: 16 }}>⚡ Generar Plan con IA</button>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ color: G, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>Nuevo Plan Nutricional</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <Label>Comidas por día</Label>
              <select value={genForm.numMeals} onChange={e => setGenForm(f => ({ ...f, numMeals: +e.target.value }))} style={iS}>
                {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n} comidas</option>)}
              </select>
            </div>
            <div>
              <Label>Duración</Label>
              <select value={genForm.weeks} onChange={e => setGenForm(f => ({ ...f, weeks: +e.target.value }))} style={iS}>
                <option value={1}>1 semana</option>
                <option value={2}>2 semanas</option>
                <option value={4}>4 semanas (mes)</option>
              </select>
            </div>
          </div>
          <Label>Tu prompt para la IA</Label>
          <textarea value={genForm.prompt} onChange={e => setGenForm(f => ({ ...f, prompt: e.target.value }))}
            placeholder="Ej: Plan de definición con déficit de 400kcal, alto en proteína, sin gluten. Priorizar pollo, pescado y verduras de temporada..." rows={4} style={{ ...iS, resize: "vertical", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={generatePlan} disabled={genLoading || !genForm.prompt.trim()} style={{ ...btnPrimary, flex: 1 }}>{genLoading ? "Generando..." : "Generar Plan"}</button>
            <button onClick={() => setCreating(false)} style={btnGhost}>Cancelar</button>
          </div>
          {genLoading && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 10, letterSpacing: 2 }}>CREANDO PLAN PERSONALIZADO... (puede tardar 30-60 seg)</div>}
        </Card>
      )}

      {loading ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 30 }}>Cargando...</div> :
        plans.length === 0 ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", padding: 30, lineHeight: 2 }}>Sin planes aún.</div> :
          plans.map(p => (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ color: "#fff", fontSize: 14 }}>{p.title}</div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 3 }}>{p.start_date} → {p.end_date}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    {[["🔥", p.total_calories, "kcal"], ["🥩", p.protein_g, "g prot"], ["🌾", p.carbs_g, "g carbs"]].map(([ic, v, u]) => (
                      <div key={u} style={{ color: GL, fontSize: 11 }}>{ic} {v}{u}</div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ background: p.is_published ? "rgba(76,175,80,0.15)" : GD, border: `1px solid ${p.is_published ? "rgba(76,175,80,0.4)" : GB}`, color: p.is_published ? "#4CAF50" : G, fontSize: 9, padding: "3px 8px", borderRadius: 2, letterSpacing: 1 }}>
                    {p.is_published ? "PUBLICADO" : "BORRADOR"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => setSelectedPlan(p)} style={{ ...btnGhost, flex: 1, fontSize: 10 }}>✏️ Editar</button>
                <button onClick={() => publishPlan(p.id, p.is_published)} style={{ ...btnGhost, flex: 1, fontSize: 10, color: p.is_published ? "#ff6b6b" : "#4CAF50", borderColor: p.is_published ? "rgba(255,107,107,0.3)" : "rgba(76,175,80,0.3)" }}>
                  {p.is_published ? "↩ Despublicar" : "📤 Publicar"}
                </button>
              </div>
            </Card>
          ))
      }
    </div>
  );
}

// ── PLAN EDITOR ───────────────────────────────────────────────
function PlanEditor({ plan, onBack }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    db.getPlanDays(plan.id).then(d => { setDays(d); if (d.length > 0) setSelectedDay(d[0]); }).finally(() => setLoading(false));
  }, [plan.id]);

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ ...btnGhost, padding: "7px 12px" }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontSize: 14 }}>{plan.title}</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>Editor de plan</div>
        </div>
      </div>
      {loading ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 30 }}>Cargando días...</div> : (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
            {days.map(d => (
              <button key={d.id} onClick={() => setSelectedDay(d)} style={{ flexShrink: 0, background: selectedDay?.id === d.id ? GD : "transparent", border: `1px solid ${selectedDay?.id === d.id ? G : GB}`, color: selectedDay?.id === d.id ? G : "rgba(255,255,255,0.4)", padding: "7px 12px", borderRadius: 2, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                Día {d.day_number}
              </button>
            ))}
          </div>
          {selectedDay && <DayEditor day={selectedDay} />}
        </>
      )}
    </div>
  );
}

// ── DAY EDITOR ────────────────────────────────────────────────
function DayEditor({ day }) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMeal, setEditMeal] = useState(null);

  useEffect(() => { db.getMeals(day.id).then(setMeals).finally(() => setLoading(false)); }, [day.id]);

  async function saveMeal(meal) {
    await db.updateMeal(meal.id, meal);
    setMeals(ms => ms.map(m => m.id === meal.id ? meal : m));
    setEditMeal(null);
  }

  if (editMeal) return <MealEditor meal={editMeal} onSave={saveMeal} onCancel={() => setEditMeal(null)} />;

  return (
    <div>
      {loading ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 20 }}>Cargando comidas...</div> :
        meals.map(m => (
          <Card key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <img src={m.image_url || FOOD_IMAGES.default} alt="" style={{ width: 64, height: 64, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: G, fontSize: 10, letterSpacing: 1, marginBottom: 2 }}>{m.time_of_day}</div>
                <div style={{ color: "#fff", fontSize: 14 }}>{m.name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>{m.calories} kcal · P:{m.protein_g}g · C:{m.carbs_g}g · G:{m.fat_g}g</div>
              </div>
              <button onClick={() => setEditMeal(m)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12 }}>✏️</button>
            </div>
          </Card>
        ))
      }
    </div>
  );
}

// ── MEAL EDITOR ───────────────────────────────────────────────
function MealEditor({ meal, onSave, onCancel }) {
  const [form, setForm] = useState({ ...meal });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ padding: "0 0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={onCancel} style={{ ...btnGhost, padding: "7px 12px" }}>← Cancelar</button>
        <div style={{ color: "#fff", fontSize: 14 }}>Editar Comida</div>
      </div>
      <img src={form.image_url || FOOD_IMAGES.default} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 4, marginBottom: 12, border: `1px solid ${GB}` }} />
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["name", "Nombre"], ["time_of_day", "Hora"], ["description", "Descripción"]].map(([k, l]) => (
            <div key={k}><Label>{l}</Label><input value={form[k] || ""} onChange={e => set(k, e.target.value)} style={iS} /></div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["calories", "Calorías"], ["protein_g", "Proteína (g)"], ["carbs_g", "Carbos (g)"], ["fat_g", "Grasas (g)"]].map(([k, l]) => (
              <div key={k}><Label>{l}</Label><input type="number" value={form[k] || ""} onChange={e => set(k, e.target.value)} style={iS} /></div>
            ))}
          </div>
          <div><Label>Receta / Preparación</Label><textarea value={form.recipe || ""} onChange={e => set("recipe", e.target.value)} rows={5} style={{ ...iS, resize: "vertical" }} /></div>
          <div><Label>URL de imagen (opcional)</Label><input value={form.image_url || ""} onChange={e => set("image_url", e.target.value)} style={iS} /></div>
        </div>
      </Card>
      <button onClick={() => onSave(form)} style={{ ...btnPrimary, width: "100%", marginTop: 12 }}>💾 Guardar Cambios</button>
    </div>
  );
}

// ── CHECKS TAB ────────────────────────────────────────────────
function ChecksTab({ client }) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { db.getChecks(client.id).then(setChecks).finally(() => setLoading(false)); }, [client.id]);
  return (
    <div style={{ padding: 14 }}>
      <div style={{ color: G, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>Verificaciones del Cliente</div>
      {loading ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 30 }}>Cargando...</div> :
        checks.length === 0 ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", padding: 30, lineHeight: 2 }}>Sin verificaciones aún.</div> :
          checks.map(c => (
            <Card key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 20 }}>{c.is_checked ? "✅" : "⭕"}</div>
                  <div>
                    <div style={{ color: "#fff", fontSize: 12 }}>{c.checked_at?.split("T")[0]}</div>
                    {c.comment && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 }}>"{c.comment}"</div>}
                  </div>
                </div>
                {c.rating && <div style={{ background: GD, border: `1px solid ${GB}`, color: GL, padding: "4px 10px", borderRadius: 2, fontSize: 12 }}>{c.rating}/10</div>}
              </div>
            </Card>
          ))
      }
    </div>
  );
}

// ── MEASUREMENTS TAB ──────────────────────────────────────────
function MeasurementsTab({ client }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], weight_kg: "", body_fat_pct: "" });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { db.getMeasurements(client.id).then(setList).finally(() => setLoading(false)); }, [client.id]);

  async function save() {
    await db.addMeasurement({ ...form, client_id: client.id });
    const updated = await db.getMeasurements(client.id);
    setList(updated); setOpen(false);
  }

  return (
    <div style={{ padding: 14 }}>
      <button onClick={() => setOpen(!open)} style={{ ...btnPrimary, width: "100%", marginBottom: 14 }}>+ Nueva Medición</button>
      {open && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: "1/-1" }}><Label>Fecha</Label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={iS} /></div>
            <div><Label>Peso (kg)</Label><input type="number" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} style={iS} /></div>
            <div><Label>% Grasa</Label><input type="number" value={form.body_fat_pct} onChange={e => setForm(f => ({ ...f, body_fat_pct: e.target.value }))} style={iS} /></div>
          </div>
          <button onClick={save} style={{ ...btnPrimary, width: "100%" }}>Guardar</button>
        </Card>
      )}
      {loading ? <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 20 }}>Cargando...</div> :
        list.map(m => (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: G, fontSize: 11 }}>{m.date}</div>
              <div style={{ display: "flex", gap: 16 }}>
                {m.weight_kg && <div style={{ textAlign: "center" }}><div style={{ color: GL, fontSize: 16, fontWeight: "bold" }}>{m.weight_kg}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>KG</div></div>}
                {m.body_fat_pct && <div style={{ textAlign: "center" }}><div style={{ color: GL, fontSize: 16, fontWeight: "bold" }}>{m.body_fat_pct}%</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>GRASA</div></div>}
              </div>
            </div>
          </Card>
        ))
      }
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────
export default function CoachApp() {
  const [auth, setAuth] = useState(false);
  const [view, setView] = useState("list");
  const [selectedClient, setSelectedClient] = useState(null);

  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "Palatino Linotype, Book Antiqua, Palatino, serif", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(201,168,76,0.05) 0%, transparent 60%)" }} />
      <div style={{ width: "100%", maxWidth: 700, flex: 1, display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
        <div style={{ padding: "14px 18px 11px", borderBottom: `1px solid ${GB}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(6,6,6,0.97)", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${G}`, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontSize: 10 }}>JL</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "#fff", fontSize: 14, letterSpacing: 1 }}>José Leiro</span>
                <span style={{ background: GD, border: `1px solid ${GB}`, color: G, fontSize: 7, padding: "2px 6px", letterSpacing: 2, textTransform: "uppercase", borderRadius: 2 }}>Coach Panel</span>
              </div>
              <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 9 }}>Panel de Gestión</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {view === "list" && <ClientList onSelect={c => { setSelectedClient(c); setView("detail"); }} onNew={() => setView("new")} />}
          {view === "new" && <NewClientForm onSave={() => setView("list")} onCancel={() => setView("list")} />}
          {view === "detail" && selectedClient && <ClientDetail client={selectedClient} onBack={() => setView("list")} />}
        </div>
      </div>
      <style>{`::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(201,168,76,0.2);border-radius:2px}input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.2)}select option{background:#1a1a1a}`}</style>
    </div>
  );
}
