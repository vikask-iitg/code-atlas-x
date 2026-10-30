import type { RawEntry } from "./types";

/**
 * "Try a sample project": a miniature of the PRD reference upload (Canavas.zip) — a React
 * board editor, an Express API, a Python canvas_core agent/asset pipeline — plus the
 * node_modules / .venv / dist noise the scanner must strip.
 */
const SRC: Record<string, string> = {
  "README.md": `# Canavas\nCollaborative canvas boards. React front end, Express API, and a Python \`canvas_core\` pipeline that runs AI agents to generate and post-process board assets.\n`,
  "package.json": JSON.stringify(
    {
      name: "canavas",
      dependencies: { react: "^19", "react-dom": "^19", "react-router-dom": "^7", konva: "^9", zustand: "^5", express: "^5", pg: "^8", idb: "^8", "@aws-sdk/client-s3": "^3" },
      devDependencies: { vite: "^6", typescript: "^5" },
    },
    null,
    2,
  ),
  "tsconfig.json": `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }`,
  "requirements.txt": "fastapi\nuvicorn\npydantic\nanthropic\npillow\nboto3\nredis\n",
  "Dockerfile": "FROM node:22\nWORKDIR /app\nCOPY . .\nRUN npm ci && npm run build\nCMD node server/app.js\n",
  "docker-compose.yml": "services:\n  api:\n    build: .\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7\n",
  ".gitignore": "*.log\n.env\n",
  "index.html": `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
  "src/main.tsx": `/** Browser entry: mounts the React app. */\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`,
  "src/App.tsx": `/** App routes: board list, editor and settings. */\nimport { BrowserRouter, Routes, Route } from "react-router-dom";\nimport BoardList from "@/components/boards/BoardList";\nimport EditorPage from "@/components/boards/editor/EditorPage";\nimport { AuthProvider } from "@/auth/AuthProvider";\nexport default function App() { return <AuthProvider><BrowserRouter><Routes><Route path="/" element={<BoardList/>}/><Route path="/b/:id" element={<EditorPage/>}/></Routes></BrowserRouter></AuthProvider>; }\n`,
  "src/auth/AuthProvider.tsx": `/** Holds the signed-in user and session token. */\nimport { api } from "@/api/client";\nexport function AuthProvider({ children }: any) { api.get("/api/auth/me"); return children; }\n`,
  "src/api/client.ts": `/** Thin fetch wrapper for the REST API. */\nexport const api = { get: (p: string) => fetch(\`\${p}\`).then(r => r.json()), post: (p: string, b: unknown) => fetch("/api" + p, { method: "POST", body: JSON.stringify(b) }) };\nexport async function listBoards() { return fetch("/api/boards").then(r => r.json()); }\n`,
  "src/components/boards/BoardList.tsx": `/** Grid of the user's boards with thumbnails. */\nimport { listBoards } from "@/api/client";\nimport BoardCard from "./BoardCard";\nexport default function BoardList() { listBoards(); return <BoardCard/>; }\n`,
  "src/components/boards/BoardCard.tsx": `/** One board tile. */\nexport default function BoardCard() { return <div/>; }\n`,
  "src/components/boards/editor/EditorPage.tsx": `/** Editor page: canvas, toolbar and layers panel for one board. */\nimport Canvas from "./Canvas";\nimport Toolbar from "./Toolbar";\nimport LayersPanel from "./LayersPanel";\nimport { useBoardStore } from "@/store/boardStore";\nimport { syncBoard } from "@/sync/syncEngine";\nexport default function EditorPage() { const s = useBoardStore(); syncBoard(s); return <><Toolbar/><Canvas/><LayersPanel/></>; }\n`,
  "src/components/boards/editor/Canvas.tsx": `/** Konva stage rendering shapes, images and AI assets. */\nimport { Stage } from "konva";\nimport { useBoardStore } from "@/store/boardStore";\nimport { checkRules } from "@/components/boards/rules/boardRules";\nexport default function Canvas() { useBoardStore(); checkRules(); return null; }\n`,
  "src/components/boards/editor/Toolbar.tsx": `/** Drawing tools and the "Generate asset" button. */\nimport { requestAsset } from "@/api/assets";\nexport default function Toolbar() { requestAsset; return null; }\n`,
  "src/components/boards/editor/LayersPanel.tsx": `/** Layer ordering and visibility. */\nimport { useBoardStore } from "@/store/boardStore";\nexport default function LayersPanel() { useBoardStore(); return null; }\n`,
  "src/components/boards/rules/boardRules.ts": `/** Validates shape limits and permissions on a board. */\nexport function checkRules() { return true; }\n`,
  "src/api/assets.ts": `/** Requests AI-generated assets from the API. */\nexport async function requestAsset(prompt: string) { return fetch("/api/assets", { method: "POST", body: prompt }); }\n`,
  "src/store/boardStore.ts": `/** Zustand store with the current board document. */\nimport { create } from "zustand";\nexport const useBoardStore = create(() => ({ shapes: [] }));\n`,
  "src/sync/syncEngine.ts": `/** Saves edits to the API and backs up offline to IndexedDB. */\nimport { openDB } from "idb";\nimport { api } from "@/api/client";\nexport async function syncBoard(s: unknown) { const db = await openDB("canavas", 1); await db.put("boards", s); await api.post("/boards/sync", s); }\n`,
  "server/app.js": `/** Express API router: mounts auth, boards and asset routes. */\nconst express = require("express");\nconst auth = require("./routes/auth");\nconst boards = require("./routes/boards");\nconst assets = require("./routes/assets");\nconst app = express();\napp.use("/api/auth", auth);\napp.use("/api/boards", boards);\napp.use("/api/assets", assets);\napp.listen(3000);\n`,
  "server/routes/auth.js": `/** Session login / logout. */\nconst router = require("express").Router();\nconst db = require("../db");\nrouter.get("/me", (req, res) => res.json(db.user(req)));\nmodule.exports = router;\n`,
  "server/routes/boards.js": `/** CRUD for boards. */\nconst router = require("express").Router();\nconst db = require("../db");\nconst storage = require("../storage");\nrouter.get("/", async (req, res) => res.json(await db.boards()));\nrouter.post("/sync", async (req, res) => { await db.save(req.body); await storage.putThumb(req.body); res.end(); });\nmodule.exports = router;\n`,
  "server/routes/assets.js": `/** Queues asset generation jobs for canvas_core. */\nconst router = require("express").Router();\nconst queue = require("../queue");\nrouter.post("/", async (req, res) => res.json(await queue.enqueue(req.body)));\nmodule.exports = router;\n`,
  "server/db.js": `/** PostgreSQL access via pg. */\nconst { Pool } = require("pg");\nconst pool = new Pool();\nmodule.exports = { boards: () => pool.query("select * from boards"), save: (b) => pool.query("..."), user: () => ({}) };\n`,
  "server/storage.js": `/** File storage: thumbnails and assets in S3. */\nconst { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");\nconst s3 = new S3Client({});\nmodule.exports = { putThumb: (b) => s3.send(new PutObjectCommand({})) };\n`,
  "server/queue.js": `/** Pushes jobs onto the Redis queue consumed by canvas_core. */\nconst redis = require("redis");\nmodule.exports = { enqueue: (job) => redis.createClient().lPush("jobs", JSON.stringify(job)) };\n`,
  "canvas_core/__init__.py": "",
  "canvas_core/worker.py": `"""Job worker: pulls asset jobs from Redis and runs the agent pipeline."""\nimport redis\nfrom canvas_core.agents.orchestrator import run_job\n\nif __name__ == "__main__":\n    r = redis.Redis()\n    while True:\n        run_job(r.blpop("jobs"))\n`,
  "canvas_core/agents/__init__.py": "",
  "canvas_core/agents/orchestrator.py": `"""Orchestrates planner and generator agents for one asset job."""\nfrom .planner import plan\nfrom .generator import generate\nfrom canvas_core.assets.pipeline import process\n\ndef run_job(job):\n    return process(generate(plan(job)))\n`,
  "canvas_core/agents/planner.py": `"""Planner agent: turns a prompt into an asset plan using Claude."""\nimport anthropic\n\ndef plan(job):\n    client = anthropic.Anthropic()\n    return client\n`,
  "canvas_core/agents/generator.py": `"""Generator agent: renders images for each planned asset."""\nfrom canvas_core.llm import call_model\n\ndef generate(plan):\n    return call_model(plan)\n`,
  "canvas_core/llm.py": `"""Shared LLM client wrapper with retries."""\nimport anthropic\n\ndef call_model(x):\n    return anthropic.Anthropic()\n`,
  "canvas_core/assets/__init__.py": "",
  "canvas_core/assets/pipeline.py": `"""Asset pipeline: resize, thumbnail and upload."""\nfrom .thumbnails import make_thumb\nfrom .upload import upload\n\ndef process(images):\n    return upload(make_thumb(images))\n`,
  "canvas_core/assets/thumbnails.py": `"""Creates thumbnails with Pillow."""\nfrom PIL import Image\n\ndef make_thumb(images):\n    return images\n`,
  "canvas_core/assets/upload.py": `"""Uploads finished assets to S3."""\nimport boto3\n\ndef upload(x):\n    boto3.client("s3").put_object(Bucket="assets", Key="k", Body=b"")\n`,
  "tests/test_pipeline.py": `from canvas_core.assets.pipeline import process\n\ndef test_process():\n    assert process([]) is not None\n`,
};

function noise(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < 260; i++) out[`node_modules/pkg-${i % 40}/lib/file${i}.js`] = "module.exports = {};";
  for (let i = 0; i < 180; i++) out[`.venv/lib/python3.12/site-packages/mod${i % 30}/f${i}.py`] = "x = 1";
  for (let i = 0; i < 12; i++) out[`dist/assets/index-${i}.js`] = "var a=1;";
  out["dist/index.html"] = "<html></html>";
  out["canvas_core/__pycache__/worker.cpython-312.pyc"] = "\u0000";
  return out;
}

export function sampleEntries(): { name: string; entries: RawEntry[]; rejected: number } {
  const all = { ...SRC, ...noise() };
  return {
    name: "Canavas (sample)",
    rejected: 0,
    entries: Object.entries(all).map(([path, text]) => ({ path, size: text.length, read: async () => text })),
  };
}
