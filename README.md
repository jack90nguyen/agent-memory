# 🧠 Agent Memory

Bộ nhớ kiến thức **theo project** cho AI agent (pattern, quyết định kỹ thuật, pitfall, quy trình…),
thay cho các file `MEMORY.md` rải rác trong từng repo.

- **SQLite** (`data/memory.db`) + full-text search FTS5, gõ không dấu vẫn tìm ra (`duong` → `đường`)
- **CLI `pmem`** cho agent đọc/ghi — tự nhận project theo **git remote** (clone ở đâu cũng khớp), không có remote thì theo path
- **Dashboard** web (mobile-first) cho người xem
- **Skill** cho Claude Code: [`skills/agent-memory/SKILL.md`](skills/agent-memory/SKILL.md)

```
 Máy CHỦ (mac-mini, luôn bật)              Máy KHÁCH (Mac Air…)
 ┌────────────────────────────┐            ┌──────────────────────┐
 │ data/memory.db             │            │ pmem (CLI)           │
 │   ▲                        │   HTTP     │ PMEM_API=            │
 │ server :4100 (pm2) ◀───────┼────────────┤  http://mac-mini:4100│
 │   ▲   tailscale serve      │  tailnet   └──────────────────────┘
 │ pmem (CLI, đọc DB trực tiếp)│
 └────────────────────────────┘            Trình duyệt → http://mac-mini:4100
```

Dữ liệu (`data/`) **không** nằm trong git — chỉ tồn tại trên máy chủ.

## 🤖 Agent setup

> Dành cho AI agent được giao "setup agent-memory". Làm tuần tự, mỗi bước đều chạy lại được (idempotent).
> Bước nào verify không ra kết quả mong đợi → **dừng lại, báo user**, đừng tự chế cách khác.

**Bước 0 — Hỏi user** máy đang setup là **máy CHỦ** (giữ DB, chạy dashboard — hiện là `mac-mini`) hay **máy KHÁCH** (dùng chung DB của máy chủ qua Tailscale). Mặc định là máy KHÁCH.

**Yêu cầu chung** — verify trước:

```bash
node -v        # cần >= 22.18 (chạy thẳng file .ts, không cần build TypeScript)
git --version
```

Repo **phải** nằm đúng path `/Users/jack/Source/Sources/agent-memory` — skill gọi CLI bằng path tuyệt đối.

```bash
REPO=/Users/jack/Source/Sources/agent-memory
if [ -d "$REPO/.git" ]; then git -C "$REPO" pull --ff-only
else git clone https://github.com/jack90nguyen/agent-memory.git "$REPO"; fi
```

### A. Máy CHỦ

```bash
cd /Users/jack/Source/Sources/agent-memory
npm ci                     # cần cả devDependencies để build dashboard
npm run build              # → web/dist

# pm2 (cài nếu chưa có: npm i -g pm2)
pm2 describe agent-memory >/dev/null 2>&1 && pm2 restart agent-memory || pm2 start ecosystem.config.cjs

# Mở cho các máy trong tailnet (giữ chế độ --http)
tailscale serve --bg --http=4100 127.0.0.1:4100
```

Verify:

```bash
curl -s http://127.0.0.1:4100/api/projects | head -c 200   # → JSON array
node src/cli.ts projects                                   # → danh sách project (DB mới thì "(chưa có project)")
```

Chỉ làm khi **user đồng ý** (ghi lại toàn bộ danh sách process pm2 / cần sudo):

```bash
pm2 save           # để máy restart thì pm2 tự chạy lại app
pm2 startup        # in ra 1 lệnh sudo — đưa user tự chạy, agent không tự chạy sudo
```

Chuyển máy chủ sang máy mới: `pm2 stop agent-memory` ở máy cũ, copy `data/memory.db` sang máy mới **trước** khi start.

### B. Máy KHÁCH

Verify kết nối tới máy chủ trước — không qua được bước này thì dừng (Tailscale chưa đăng nhập / mac-mini tắt):

```bash
curl -s -m 5 http://mac-mini:4100/api/projects | head -c 200   # → JSON array
```

```bash
cd /Users/jack/Source/Sources/agent-memory
npm ci --omit=dev          # chỉ runtime deps, không cần vite/react

# CLI gọi API máy chủ thay vì mở DB local
grep -q '^export PMEM_API=' ~/.zshrc || echo 'export PMEM_API=http://mac-mini:4100' >> ~/.zshrc
```

Verify:

```bash
PMEM_API=http://mac-mini:4100 node src/cli.ts projects    # → danh sách project của máy chủ
ls data 2>/dev/null || echo "OK: máy khách không có DB local"
```

⚠️ Thiếu `PMEM_API` thì CLI sẽ âm thầm tạo **DB rỗng local** ở `data/` và ghi vào đó. Dấu hiệu: `projects` ra
`(chưa có project)`. Xử lý: kiểm tra `echo $PMEM_API`, xoá thư mục `data/` vừa bị tạo ra.

### Cài skill (cả máy CHỦ lẫn KHÁCH)

Symlink để `git pull` là skill cập nhật theo. Skill cũ (nếu là thư mục thật) được chuyển ra **ngoài** `~/.claude/skills`
— để trong đó Claude Code sẽ thấy 2 skill trùng tên.

```bash
SKILL=~/.claude/skills/agent-memory
mkdir -p ~/.claude/skills
if [ -e "$SKILL" ] && [ ! -L "$SKILL" ]; then mv "$SKILL" ~/.claude/agent-memory-skill.bak; fi
ln -sfn /Users/jack/Source/Sources/agent-memory/skills/agent-memory "$SKILL"
ls -l "$SKILL"   # → trỏ vào .../agent-memory/skills/agent-memory
```

**Cuối cùng:** báo user **mở session agent mới** — skill và biến `PMEM_API` chỉ được nạp lúc session khởi động.

## CLI

```bash
node /Users/jack/Source/Sources/agent-memory/src/cli.ts <command>
```

| Lệnh | Việc |
|---|---|
| `projects` | Danh sách project + số entry + remote + path |
| `show [-p slug] [--type T]` | Cả project dạng markdown, kèm id `[sN]` / `[eN]` |
| `search "<q>" [-p slug]` | Full-text search |
| `get <eN>` | Chi tiết 1 entry |
| `add-project <slug> "<name>" --path <dir>` | Đăng ký project (tự lấy git remote) |
| `add-section "<title>" --type T [--parent sN]` | Thêm section (`##`, `--parent` → `###`) |
| `add <sN> ["<content>"] [--ref F] [--tags a,b]` | Thêm entry — content dài truyền qua stdin |
| `update <eN>` · `del <eN>` · `del-section <sN>` | Sửa / xoá |
| `backfill-remote` | Gán git remote cho project cũ (chỉ chạy trên máy chủ) |

Type: `pattern` · `decision` · `pitfall` · `process` · `preference` · `note` · `todo`.
Không truyền `-p` → tự nhận project của thư mục hiện tại: **git remote** trước, rồi tới **path**.
Quy ước ghi (entry = 1 ý, khi nào cần xin phép…) xem trong [SKILL.md](skills/agent-memory/SKILL.md).

## Import `MEMORY.md` cũ

Chạy trên máy CHỦ. Mỗi `##` → section, `###` → section con, mỗi bullet / đoạn / bảng / code block → 1 entry.

```bash
node scripts/import-md.ts /path/to/repo              # slug = tên folder viết thường
node scripts/import-md.ts /path/to/repo --replace    # import lại (XOÁ dữ liệu cũ của project đó)
```

## Dev

```bash
npm start            # server :4100 (API + dashboard từ web/dist)
npm run dev:web      # Vite dev server, proxy /api → :4100
npm run typecheck
```
