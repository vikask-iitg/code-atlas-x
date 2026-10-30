import type { Analysis, FileInfo, RawEntry, StackItem, TreeNode } from "./types";
import { CODE_LANGS, PARSED_LANGS, extOf, languageOf } from "./languages";

export type Progress = (stage: string, done: number, total: number) => void;

const JS_EXTS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "vue", "svelte"];

// ---------- secret redaction (privacy NFR) ----------

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
  /xox[abpr]-[A-Za-z0-9-]{10,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /((?:api[_-]?key|secret|password|passwd|token|auth)[A-Za-z_]*\s*[:=]\s*)(["'])[^"'\n]{6,}\2/gi,
  /((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/]+:)[^@\s]+@/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, p1, p2) => {
      if (typeof p1 === "string" && typeof p2 === "string" && p2.length === 1) return `${p1}${p2}[REDACTED]${p2}`;
      if (typeof p1 === "string" && /:\/\//.test(p1)) return `${p1}[REDACTED]@`;
      return "[REDACTED]";
    });
  }
  return out;
}

export function isSecretFile(path: string): boolean {
  const base = (path.split("/").pop() ?? "").toLowerCase();
  return (
    (base.startsWith(".env") && base !== ".env.example" && base !== ".env.sample") ||
    /\.(pem|key|p12|pfx|keystore|jks)$/.test(base) ||
    base === "id_rsa" ||
    base === "credentials.json" ||
    base === "secrets.json"
  );
}

// ---------- import extraction ----------

function stripJsonComments(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1");
}

function jsImports(src: string): string[] {
  const out: string[] = [];
  const res = [
    /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of res) for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function pyImports(src: string): { module: string; names: string[] }[] {
  const out: { module: string; names: string[] }[] = [];
  const code = src.replace(/("""|''')[\s\S]*?\1/g, "");
  for (const m of code.matchAll(/^[ \t]*from\s+(\.*[\w.]*)\s+import\s+(\([^)]*\)|[^\n#]+)/gm)) {
    const names = m[2]
      .replace(/[()]/g, "")
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter((s) => s && s !== "*");
    out.push({ module: m[1], names });
  }
  for (const m of code.matchAll(/^[ \t]*import\s+([^\n#]+)/gm)) {
    for (const part of m[1].split(",")) {
      const mod = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[\w.]+$/.test(mod)) out.push({ module: mod, names: [] });
    }
  }
  return out;
}

function javaImports(src: string): { pkg?: string; imports: string[] } {
  const pkg = src.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
  const imports = [...src.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm)].map((m) => m[1]);
  return { pkg, imports };
}

function goImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) out.push(m[1]);
  for (const block of src.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
    for (const m of block[1].matchAll(/(?:[\w.]+\s+)?"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

// ---------- symbols & summaries ----------

function symbolsOf(lang: string, src: string): string[] {
  const out = new Set<string>();
  const add = (re: RegExp) => {
    for (const m of src.matchAll(re)) if (out.size < 12) out.add(m[1]);
  };
  if (lang === "TypeScript" || lang === "JavaScript" || lang === "Vue" || lang === "Svelte") {
    add(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g);
    if (out.size === 0) add(/^(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm);
  } else if (lang === "Python") {
    add(/^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/gm);
  } else if (lang === "Java" || lang === "Kotlin") {
    add(/(?:public|protected)\s+(?:abstract\s+|final\s+|static\s+)*(?:class|interface|enum|record)\s+(\w+)/g);
    add(/public\s+(?:static\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\(/g);
  } else if (lang === "Go") {
    add(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm);
    add(/^type\s+([A-Z]\w*)/gm);
  }
  return [...out];
}

function docOf(lang: string, src: string): string {
  let m: RegExpMatchArray | null = null;
  if (lang === "Python") m = src.match(/^\s*(?:#[^\n]*\n\s*)*(?:"""|''')([\s\S]*?)(?:"""|''')/);
  else m = src.match(/^\s*(?:(?:"use \w+"|'use \w+');?\s*)?\/\*\*?([\s\S]*?)\*\//) ?? src.match(/^\s*((?:\/\/[^\n]*\n){1,4})/);
  if (!m) return "";
  return m[1]
    .replace(/^\s*[*/#]+\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

// ---------- detections (A4) ----------

interface Detector {
  tag: string;
  test: RegExp;
  langs?: string[];
}

const DETECTORS: Detector[] = [
  // routes
  { tag: "route:express", test: /\b(?:app|router|server)\.(?:get|post|put|patch|delete|use|all)\s*\(\s*["'`]\//, langs: ["TypeScript", "JavaScript"] },
  { tag: "route:fastapi", test: /@(?:app|router|\w+_router)\.(?:get|post|put|patch|delete|websocket)\s*\(/, langs: ["Python"] },
  { tag: "route:flask", test: /@(?:app|bp|\w+_bp|blueprint)\.route\s*\(/, langs: ["Python"] },
  { tag: "route:django", test: /\burlpatterns\s*=/, langs: ["Python"] },
  { tag: "route:spring", test: /@(?:RestController|Controller|GetMapping|PostMapping|RequestMapping)\b/, langs: ["Java", "Kotlin"] },
  { tag: "route:go-http", test: /\b(?:http\.HandleFunc|\.HandleFunc|gin\.Default|echo\.New|chi\.NewRouter|\.GET\(|\.POST\()/, langs: ["Go"] },
  { tag: "route:trpc", test: /\b(?:createTRPCRouter|router\(\{|publicProcedure)/, langs: ["TypeScript", "JavaScript"] },
  // db / storage
  { tag: "db:prisma", test: /@prisma\/client|new PrismaClient/ },
  { tag: "db:sqlalchemy", test: /\bsqlalchemy\b|declarative_base|create_engine\(/ },
  { tag: "db:mongoose", test: /\bmongoose\b/ },
  { tag: "db:mongodb", test: /\bpymongo\b|MongoClient/ },
  { tag: "db:postgres", test: /\bpsycopg2?\b|asyncpg|from ["']pg["']|require\(["']pg["']\)|\bpostgres(?:ql)?:\/\/|jdbc:postgresql|lib\/pq|pgx/ },
  { tag: "db:mysql", test: /\bmysql2?\b|pymysql|jdbc:mysql/ },
  { tag: "db:sqlite", test: /\bsqlite3?\b|better-sqlite3/ },
  { tag: "db:redis", test: /\bredis\b|ioredis/i },
  { tag: "db:drizzle", test: /drizzle-orm/ },
  { tag: "db:typeorm", test: /\btypeorm\b/ },
  { tag: "db:django-orm", test: /from django\.db import models/ },
  { tag: "db:jpa", test: /@Entity\b|JpaRepository/ },
  { tag: "db:gorm", test: /gorm\.io\/gorm/ },
  { tag: "db:supabase", test: /@supabase\/supabase-js|from supabase import/ },
  { tag: "db:firebase", test: /\bfirebase(?:-admin)?\b|firestore/i },
  { tag: "db:indexeddb", test: /\bindexedDB\b|from ["']idb["']|dexie/i },
  { tag: "db:localstorage", test: /\blocalStorage\.(?:setItem|getItem)/ },
  { tag: "storage:s3", test: /@aws-sdk\/client-s3|\bboto3\b|S3Client|s3\.put_object|aws-sdk-go.*s3/ },
  { tag: "storage:gcs", test: /@google-cloud\/storage|google\.cloud import storage/ },
  { tag: "storage:filesystem", test: /\bfs\.(?:writeFile|createWriteStream)|open\([^)]*["']w[b+]?["']|os\.makedirs|shutil\.|Path\([^)]*\)\.write_/ },
  // external services
  { tag: "ext:openai", test: /\bopenai\b/i },
  { tag: "ext:anthropic", test: /@anthropic-ai\/sdk|\banthropic\b/ },
  { tag: "ext:gemini", test: /google\.generativeai|@google\/generative-ai|google-genai/ },
  { tag: "ext:stripe", test: /\bstripe\b/i },
  { tag: "ext:twilio", test: /\btwilio\b/i },
  { tag: "ext:sendgrid", test: /sendgrid|nodemailer|smtplib/i },
  { tag: "ext:auth0", test: /auth0|next-auth|clerk|passport\b|firebase\/auth/i },
  { tag: "ext:http", test: /\bfetch\s*\(\s*["'`]https?:\/\/|axios\.(?:get|post)\s*\(\s*["'`]https?:|requests\.(?:get|post)\s*\(\s*f?["']https?:|httpx\.|http\.Get\(/ },
  { tag: "client:api", test: /\b(?:fetch|axios(?:\.\w+)?|ky(?:\.\w+)?|\$http\.\w+)\s*\(\s*[`"'](?:\$\{[^}]+\})?\/api\b|baseURL\s*:\s*[`"'][^`"']*\/api/ },
  { tag: "ext:websocket", test: /new WebSocket\(|socket\.io|websockets\b/ },
  { tag: "queue:celery", test: /\bcelery\b/i },
  { tag: "queue:bullmq", test: /\bbullmq\b|\bbull\b/ },
  { tag: "queue:kafka", test: /kafkajs|confluent_kafka|kafka-go/ },
  { tag: "sched:cron", test: /node-cron|\bcron\.schedule|APScheduler|@Scheduled|schedule\.every/ },
];

function detect(lang: string, src: string, path: string): string[] {
  const tags = new Set<string>();
  for (const d of DETECTORS) {
    if (d.langs && !d.langs.includes(lang)) continue;
    if (d.test.test(src)) tags.add(d.tag);
  }
  // Next.js / file-system routes
  if (/(^|\/)app\/(.*\/)?route\.(ts|js)$/.test(path) || /(^|\/)pages\/api\//.test(path)) tags.add("route:nextjs");
  if (/(^|\/)app\/(.*\/)?page\.(tsx|jsx|ts|js)$/.test(path)) tags.add("page:nextjs");
  // entry points
  const base = path.split("/").pop() ?? "";
  if (lang === "Python" && /if\s+__name__\s*==\s*["']__main__["']/.test(src)) tags.add("entry");
  if (lang === "Go" && /^package\s+main\b/m.test(src) && /func\s+main\s*\(/.test(src)) tags.add("entry");
  if ((lang === "Java" || lang === "Kotlin") && /static\s+void\s+main\s*\(|@SpringBootApplication|fun\s+main\s*\(/.test(src)) tags.add("entry");
  if (/^(main|index|app|server)\.(tsx?|jsx?|mjs)$/.test(base) && path.split("/").length <= 3) tags.add("entry");
  if (/^(main|app|server|manage|wsgi|asgi|cli|__main__)\.py$/.test(base)) tags.add("entry");
  if (base === "index.html" && path.split("/").length <= 2) tags.add("entry");
  if (/ReactDOM\.(?:render|createRoot)|createRoot\(|createApp\(/.test(src)) tags.add("entry:ui");
  if (/\bFastAPI\s*\(|\bFlask\s*\(|express\(\)|http\.ListenAndServe|app\.listen\(|uvicorn\.run/.test(src)) tags.add("entry:server");
  if (/argparse|click\.command|typer\.Typer|commander|yargs|cobra\.Command/.test(src)) tags.add("entry:cli");
  if (/(^|\/)(tests?|__tests__|spec)\//.test(path) || /[._-](test|spec)\.\w+$/.test(base) || /^test_.*\.py$/.test(base)) tags.add("test");
  return [...tags];
}

// ---------- manifests / stack (A2) ----------

const PKG_STACK: Record<string, [string, StackItem["kind"]]> = {
  react: ["React", "framework"],
  next: ["Next.js", "framework"],
  vue: ["Vue", "framework"],
  nuxt: ["Nuxt", "framework"],
  svelte: ["Svelte", "framework"],
  "@sveltejs/kit": ["SvelteKit", "framework"],
  "@angular/core": ["Angular", "framework"],
  express: ["Express", "framework"],
  fastify: ["Fastify", "framework"],
  koa: ["Koa", "framework"],
  "@nestjs/core": ["NestJS", "framework"],
  vite: ["Vite", "tool"],
  webpack: ["Webpack", "tool"],
  tailwindcss: ["Tailwind CSS", "tool"],
  electron: ["Electron", "framework"],
  "react-native": ["React Native", "framework"],
  "@prisma/client": ["Prisma", "database"],
  prisma: ["Prisma", "database"],
  mongoose: ["MongoDB (Mongoose)", "database"],
  pg: ["PostgreSQL", "database"],
  mysql2: ["MySQL", "database"],
  redis: ["Redis", "database"],
  ioredis: ["Redis", "database"],
  "drizzle-orm": ["Drizzle ORM", "database"],
  typeorm: ["TypeORM", "database"],
  "@supabase/supabase-js": ["Supabase", "service"],
  firebase: ["Firebase", "service"],
  stripe: ["Stripe", "service"],
  openai: ["OpenAI API", "service"],
  "@anthropic-ai/sdk": ["Claude API", "service"],
  "socket.io": ["Socket.IO", "framework"],
  zustand: ["Zustand", "tool"],
  "@reduxjs/toolkit": ["Redux", "tool"],
  "@tanstack/react-query": ["React Query", "tool"],
  "react-router-dom": ["React Router", "tool"],
  "fabric": ["Fabric.js", "tool"],
  konva: ["Konva", "tool"],
  "three": ["Three.js", "tool"],
  dexie: ["IndexedDB (Dexie)", "database"],
  idb: ["IndexedDB", "database"],
  "@aws-sdk/client-s3": ["AWS S3", "service"],
};

const PY_STACK: Record<string, [string, StackItem["kind"]]> = {
  fastapi: ["FastAPI", "framework"],
  flask: ["Flask", "framework"],
  django: ["Django", "framework"],
  sqlalchemy: ["SQLAlchemy", "database"],
  psycopg2: ["PostgreSQL", "database"],
  "psycopg2-binary": ["PostgreSQL", "database"],
  psycopg: ["PostgreSQL", "database"],
  asyncpg: ["PostgreSQL", "database"],
  pymongo: ["MongoDB", "database"],
  redis: ["Redis", "database"],
  celery: ["Celery", "infra"],
  pydantic: ["Pydantic", "tool"],
  openai: ["OpenAI API", "service"],
  anthropic: ["Claude API", "service"],
  langchain: ["LangChain", "tool"],
  boto3: ["AWS SDK", "service"],
  pillow: ["Pillow", "tool"],
  numpy: ["NumPy", "tool"],
  pandas: ["pandas", "tool"],
  torch: ["PyTorch", "tool"],
  uvicorn: ["Uvicorn", "infra"],
  streamlit: ["Streamlit", "framework"],
  typer: ["Typer CLI", "tool"],
  click: ["Click CLI", "tool"],
  requests: ["requests", "tool"],
  httpx: ["httpx", "tool"],
};

function detectStack(manifests: { path: string; text: string }[], langs: Set<string>): StackItem[] {
  const out = new Map<string, StackItem>();
  const add = (name: string, kind: StackItem["kind"], source: string) => {
    if (!out.has(name)) out.set(name, { name, kind, source });
  };
  for (const l of langs) if (CODE_LANGS.has(l)) add(l, "language", "file extensions");
  for (const m of manifests) {
    const base = m.path.split("/").pop()!.toLowerCase();
    try {
      if (base === "package.json") {
        const pkg = JSON.parse(m.text);
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        for (const d of Object.keys(deps)) if (PKG_STACK[d]) add(PKG_STACK[d][0], PKG_STACK[d][1], m.path);
      } else if (base === "requirements.txt" || base === "pyproject.toml" || base === "pipfile" || base === "setup.py") {
        const names = [...m.text.matchAll(/^\s*["']?([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*(?:[<>=~!;"',\s]|$)/gm)].map((x) =>
          x[1].toLowerCase(),
        );
        for (const n of names) if (PY_STACK[n]) add(PY_STACK[n][0], PY_STACK[n][1], m.path);
      } else if (base === "pom.xml" || base.startsWith("build.gradle")) {
        if (/spring-boot/.test(m.text)) add("Spring Boot", "framework", m.path);
        if (/hibernate|spring-boot-starter-data-jpa/.test(m.text)) add("JPA / Hibernate", "database", m.path);
        if (/postgresql/.test(m.text)) add("PostgreSQL", "database", m.path);
        if (/mysql/.test(m.text)) add("MySQL", "database", m.path);
        add(base === "pom.xml" ? "Maven" : "Gradle", "tool", m.path);
      } else if (base === "go.mod") {
        add("Go modules", "tool", m.path);
        if (/gin-gonic/.test(m.text)) add("Gin", "framework", m.path);
        if (/labstack\/echo/.test(m.text)) add("Echo", "framework", m.path);
        if (/go-chi/.test(m.text)) add("chi", "framework", m.path);
        if (/gorm\.io/.test(m.text)) add("GORM", "database", m.path);
        if (/jackc\/pgx|lib\/pq/.test(m.text)) add("PostgreSQL", "database", m.path);
      } else if (base.startsWith("dockerfile")) {
        add("Docker", "infra", m.path);
      } else if (/^docker-compose|^compose\.ya?ml/.test(base)) {
        add("Docker Compose", "infra", m.path);
        for (const [re, name] of [
          [/image:\s*postgres/, "PostgreSQL"],
          [/image:\s*mysql/, "MySQL"],
          [/image:\s*mongo/, "MongoDB"],
          [/image:\s*redis/, "Redis"],
          [/image:\s*(?:rabbitmq)/, "RabbitMQ"],
        ] as [RegExp, string][])
          if (re.test(m.text)) add(name, "database", m.path);
      } else if (base === "schema.prisma") {
        const prov = m.text.match(/provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|sqlserver)"/)?.[1];
        add("Prisma", "database", m.path);
        if (prov) add({ postgresql: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite", mongodb: "MongoDB", sqlserver: "SQL Server" }[prov]!, "database", m.path);
      }
    } catch {
      /* malformed manifest: ignore */
    }
  }
  return [...out.values()];
}

const MANIFEST_RE =
  /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|setup\.py|pom\.xml|build\.gradle(\.kts)?|go\.mod|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|schema\.prisma|tsconfig[^/]*\.json|jsconfig\.json)$/i;

// ---------- resolution ----------

interface TsPaths {
  dir: string;
  baseUrl: string;
  paths: Record<string, string[]>;
}

function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

function joinPath(base: string, rel: string): string | null {
  const parts = base ? base.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

class Resolver {
  private fileSet: Set<string>;
  private pyIndex = new Map<string, string[]>();
  private javaIndex = new Map<string, string>();
  private javaPkgIndex = new Map<string, string[]>();
  private goDirs = new Map<string, string[]>();
  goModules: { dir: string; module: string }[] = [];
  tsPaths: TsPaths[] = [];

  constructor(paths: string[]) {
    this.fileSet = new Set(paths);
    for (const p of paths) {
      if (p.endsWith(".py")) {
        const mod = p.slice(0, -3).replace(/\/__init__$/, "");
        const parts = mod.split("/");
        for (let i = 0; i < parts.length; i++) {
          const key = parts.slice(i).join(".");
          const arr = this.pyIndex.get(key) ?? [];
          arr.push(p);
          this.pyIndex.set(key, arr);
        }
      } else if (p.endsWith(".go")) {
        const d = dirname(p);
        this.goDirs.set(d, [...(this.goDirs.get(d) ?? []), p]);
      }
    }
  }

  addJava(path: string, pkg?: string) {
    const cls = (path.split("/").pop() ?? "").replace(/\.(java|kt)$/, "");
    if (pkg) {
      this.javaIndex.set(`${pkg}.${cls}`, path);
      this.javaPkgIndex.set(pkg, [...(this.javaPkgIndex.get(pkg) ?? []), path]);
    }
  }

  private tryJsFile(p: string): string | null {
    if (this.fileSet.has(p)) return p;
    // TS projects often import "./x.js" that is really "./x.ts"
    const noExt = p.replace(/\.(js|jsx|mjs|cjs)$/, "");
    for (const e of JS_EXTS) if (this.fileSet.has(`${noExt}.${e}`)) return `${noExt}.${e}`;
    for (const e of JS_EXTS) if (this.fileSet.has(`${p}/index.${e}`)) return `${p}/index.${e}`;
    return null;
  }

  resolveJs(from: string, spec: string): { file?: string; pkg?: string } {
    if (spec.startsWith(".")) {
      const target = joinPath(dirname(from), spec);
      const f = target != null ? this.tryJsFile(target) : null;
      return f ? { file: f } : {};
    }
    // tsconfig paths, nearest config first
    const cfgs = this.tsPaths.filter((c) => from.startsWith(c.dir ? c.dir + "/" : "")).sort((a, b) => b.dir.length - a.dir.length);
    for (const cfg of cfgs) {
      for (const [pattern, targets] of Object.entries(cfg.paths)) {
        const star = pattern.indexOf("*");
        const pre = star >= 0 ? pattern.slice(0, star) : pattern;
        const post = star >= 0 ? pattern.slice(star + 1) : "";
        if (star >= 0 ? spec.startsWith(pre) && spec.endsWith(post) : spec === pattern) {
          const mid = star >= 0 ? spec.slice(pre.length, spec.length - post.length) : "";
          for (const t of targets) {
            const p = joinPath(joinPath(cfg.dir, cfg.baseUrl) ?? "", t.replace("*", mid));
            const f = p != null ? this.tryJsFile(p) : null;
            if (f) return { file: f };
          }
        }
      }
      if (cfg.baseUrl) {
        const p = joinPath(joinPath(cfg.dir, cfg.baseUrl) ?? "", spec);
        const f = p != null ? this.tryJsFile(p) : null;
        if (f) return { file: f };
      }
    }
    // common "@/x" and "~/x" aliases even without tsconfig
    const m = spec.match(/^[@~]\/(.*)$/);
    if (m) {
      for (const root of ["src", "", "app"]) {
        const f = this.tryJsFile(root ? `${root}/${m[1]}` : m[1]);
        if (f) return { file: f };
      }
    }
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    return { pkg };
  }

  resolvePy(from: string, module: string, names: string[]): { files: string[]; pkg?: string } {
    const files: string[] = [];
    if (module.startsWith(".")) {
      const dots = module.match(/^\.+/)![0].length;
      let base = dirname(from);
      for (let i = 1; i < dots; i++) base = dirname(base);
      const rest = module.slice(dots).replace(/\./g, "/");
      const target = rest ? (base ? `${base}/${rest}` : rest) : base;
      const cands = [`${target}.py`, `${target}/__init__.py`];
      for (const n of names) cands.push(`${target}/${n}.py`, `${target}/${n}/__init__.py`);
      for (const c of cands) if (this.fileSet.has(c)) files.push(c);
      return { files: [...new Set(files)] };
    }
    const lookup = (key: string): string | undefined => {
      const arr = this.pyIndex.get(key);
      if (!arr) return undefined;
      if (arr.length === 1) return arr[0];
      // prefer the candidate closest to the importing file
      const fromDir = dirname(from);
      return arr.slice().sort((a, b) => commonPrefix(b, fromDir) - commonPrefix(a, fromDir) || a.length - b.length)[0];
    };
    for (const n of names) {
      const sub = lookup(`${module}.${n}`);
      if (sub) files.push(sub);
    }
    const direct = lookup(module);
    if (direct && !files.length) files.push(direct);
    if (files.length) return { files: [...new Set(files)] };
    return { files, pkg: module.split(".")[0] };
  }

  resolveJava(imp: string): { files: string[]; pkg?: string } {
    if (imp.endsWith(".*")) {
      const arr = this.javaPkgIndex.get(imp.slice(0, -2));
      return arr ? { files: arr } : { files: [], pkg: imp.split(".").slice(0, 2).join(".") };
    }
    // also handles static imports of members: a.b.C.method
    let key = imp;
    while (key.includes(".")) {
      const f = this.javaIndex.get(key);
      if (f) return { files: [f] };
      key = key.slice(0, key.lastIndexOf("."));
    }
    return { files: [], pkg: imp.split(".").slice(0, 2).join(".") };
  }

  resolveGo(imp: string): { files: string[]; pkg?: string } {
    for (const m of this.goModules) {
      if (imp === m.module || imp.startsWith(m.module + "/")) {
        const rel = imp.slice(m.module.length).replace(/^\//, "");
        const dir = [m.dir, rel].filter(Boolean).join("/");
        const arr = this.goDirs.get(dir);
        if (arr) return { files: arr.filter((f) => !f.endsWith("_test.go")) };
      }
    }
    return { files: [], pkg: imp };
  }
}

function commonPrefix(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// ---------- tree ----------

function buildTree(name: string, files: FileInfo[]): TreeNode {
  const root: TreeNode = { name, path: "", type: "dir", size: 0, lines: 0, fileCount: 0, children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      cur.size += f.size;
      cur.lines += f.lines;
      cur.fileCount += 1;
      const isFile = i === parts.length - 1;
      const p = parts.slice(0, i + 1).join("/");
      let child = cur.children!.find((c) => c.name === parts[i]);
      if (!child) {
        child = isFile
          ? { name: parts[i], path: p, type: "file", size: f.size, lines: f.lines, language: f.language, fileCount: 1 }
          : { name: parts[i], path: p, type: "dir", size: 0, lines: 0, fileCount: 0, children: [] };
        cur.children!.push(child);
      }
      cur = child;
    }
  }
  const sort = (n: TreeNode) => {
    n.children?.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    n.children?.forEach(sort);
  };
  sort(root);
  return root;
}

// ---------- main ----------

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

export async function analyse(
  projectName: string,
  entries: RawEntry[],
  stats: { totalFiles: number; ignoredFiles: number },
  onProgress: Progress,
  contents: Map<string, string>,
): Promise<Analysis> {
  const total = entries.length;
  // 1. read text
  let done = 0;
  const texts: { path: string; text: string; size: number }[] = [];
  const BATCH = 32;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const res = await Promise.all(
      chunk.map(async (e) => {
        try {
          const t = await e.read();
          // crude binary sniff
          if (t.slice(0, 2000).includes("\u0000")) return null;
          return { path: e.path, text: t, size: e.size };
        } catch {
          return null;
        }
      }),
    );
    for (const r of res) if (r) texts.push(r);
    done += chunk.length;
    onProgress("Extracting", done, total);
    await yieldToUi();
  }

  for (const t of texts) contents.set(t.path, t.text);

  // 2. manifests + resolver config
  const paths = texts.map((t) => t.path);
  const resolver = new Resolver(paths);
  const manifests = texts.filter((t) => MANIFEST_RE.test(t.path));
  for (const m of manifests) {
    const base = m.path.split("/").pop()!;
    if (/^(tsconfig|jsconfig)/.test(base)) {
      try {
        const cfg = JSON.parse(stripJsonComments(m.text));
        const co = cfg.compilerOptions ?? {};
        if (co.paths || co.baseUrl) resolver.tsPaths.push({ dir: dirname(m.path), baseUrl: co.baseUrl ?? ".", paths: co.paths ?? {} });
      } catch {
        /* ignore */
      }
    } else if (base === "go.mod") {
      const mod = m.text.match(/^module\s+(\S+)/m)?.[1];
      if (mod) resolver.goModules.push({ dir: dirname(m.path), module: mod });
    }
  }

  // Java needs a first pass for package declarations
  const javaParsed = new Map<string, { pkg?: string; imports: string[] }>();
  for (const t of texts) {
    const lang = languageOf(t.path);
    if (lang === "Java" || lang === "Kotlin") {
      const j = javaImports(t.text);
      javaParsed.set(t.path, j);
      resolver.addJava(t.path, j.pkg);
    }
  }

  // 3. parse imports
  const files: FileInfo[] = [];
  const edges: { from: string; to: string }[] = [];
  done = 0;
  for (const t of texts) {
    const lang = languageOf(t.path);
    const lines = t.text.length ? t.text.split("\n").length : 0;
    const internal = new Set<string>();
    const external = new Set<string>();
    if (PARSED_LANGS.has(lang)) {
      if (lang === "TypeScript" || lang === "JavaScript" || lang === "Vue" || lang === "Svelte") {
        for (const spec of jsImports(t.text)) {
          const r = resolver.resolveJs(t.path, spec);
          if (r.file) internal.add(r.file);
          else if (r.pkg && !spec.startsWith(".")) external.add(r.pkg);
        }
      } else if (lang === "Python") {
        for (const imp of pyImports(t.text)) {
          const r = resolver.resolvePy(t.path, imp.module, imp.names);
          r.files.forEach((f) => internal.add(f));
          if (r.pkg) external.add(r.pkg);
        }
      } else if (lang === "Java") {
        for (const imp of javaParsed.get(t.path)?.imports ?? []) {
          const r = resolver.resolveJava(imp);
          r.files.forEach((f) => internal.add(f));
          if (r.pkg) external.add(r.pkg);
        }
      } else if (lang === "Go") {
        for (const imp of goImports(t.text)) {
          const r = resolver.resolveGo(imp);
          r.files.forEach((f) => internal.add(f));
          if (r.pkg && imp.includes(".")) external.add(r.pkg);
        }
      }
    }
    internal.delete(t.path);
    for (const to of internal) edges.push({ from: t.path, to });
    const isCode = CODE_LANGS.has(lang);
    files.push({
      path: t.path,
      language: lang,
      size: t.size,
      lines,
      imports: [...internal],
      externalImports: [...external],
      summary: isCode ? docOf(lang, t.text) : "",
      symbols: isCode ? symbolsOf(lang, t.text) : [],
      tags: isCode || lang === "HTML" ? detect(lang, t.text, t.path) : [],
    });
    done++;
    if (done % 50 === 0) {
      onProgress("Parsing imports", done, texts.length);
      await yieldToUi();
    }
  }
  onProgress("Parsing imports", texts.length, texts.length);

  const langSet = new Set(files.map((f) => f.language));
  const stack = detectStack(manifests, langSet);
  for (const f of files) {
    for (const tag of f.tags) {
      if (tag === "db:indexeddb") stack.push({ name: "IndexedDB", kind: "database", source: f.path });
      if (tag === "db:localstorage") stack.push({ name: "localStorage", kind: "database", source: f.path });
    }
  }
  const dedupStack = [...new Map(stack.map((s) => [s.name, s])).values()];

  const readmeEntry =
    texts.find((t) => /^readme(\.md|\.rst|\.txt)?$/i.test(t.path)) ?? texts.find((t) => /(^|\/)readme\.md$/i.test(t.path));

  const langAgg = new Map<string, { files: number; lines: number }>();
  for (const f of files) {
    const a = langAgg.get(f.language) ?? { files: 0, lines: 0 };
    a.files++;
    a.lines += f.lines;
    langAgg.set(f.language, a);
  }

  return {
    projectName,
    files,
    tree: buildTree(projectName, files),
    stack: dedupStack,
    edges,
    readme: readmeEntry ? redactSecrets(readmeEntry.text.slice(0, 4000)) : undefined,
    languages: [...langAgg.entries()].map(([language, v]) => ({ language, ...v })).sort((a, b) => b.lines - a.lines),
    stats: {
      totalFiles: stats.totalFiles,
      ignoredFiles: stats.ignoredFiles,
      analysedFiles: files.length,
      totalLines: files.reduce((s, f) => s + f.lines, 0),
    },
  };
}

export function isSourceFile(f: FileInfo) {
  return CODE_LANGS.has(f.language) || ["HTML", "SQL", "Prisma", "GraphQL", "Protobuf"].includes(f.language);
}

export { extOf };
