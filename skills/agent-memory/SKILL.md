---
name: agent-memory
description: Kiến thức code/project (pattern, quyết định kỹ thuật, pitfall, quy trình, domain knowledge, todo việc cần làm) lưu trong SQLite local — thay cho file MEMORY.md trong từng repo. Dùng khi cần đọc/ghi "memory của project", "pattern đã dùng", "lưu ý của repo", "ghi lại pattern này", hoặc trước khi làm task trong 1 project đã đăng ký.
---

# Project Memory (`pmem`)

App `agent-memory` ở `/Users/jack/Source/Sources/agent-memory`, DB `data/memory.db`.
Dashboard: http://localhost:4100 (pm2 `agent-memory`, máy khác: http://mac-mini:4100). AI dùng CLI, **không** gọi API trực tiếp.

```bash
node /Users/jack/Source/Sources/agent-memory/src/cli.ts <command> [args]
```

Không truyền `-p` thì CLI tự nhận project của thư mục hiện tại, theo thứ tự:
1. **git remote** (`origin`, chuẩn hoá về `github.com/owner/repo`) — clone repo ở folder nào cũng khớp
2. **path** đã đăng ký (tiền tố dài nhất) — cho repo không có remote / không phải git repo

ID chấp nhận dạng `12`, `e12` (entry), `s12` (section).

## Dùng từ máy khác (Mac Air…) qua Tailscale

DB chỉ nằm trên **mac-mini** (luôn bật). Máy khác dùng CLI ở chế độ HTTP — không cần DB local:

```bash
# clone ĐÚNG path như mac-mini để lệnh trong skill này dùng y nguyên
git clone https://github.com/jack90nguyen/agent-memory.git /Users/jack/Source/Sources/agent-memory
cd /Users/jack/Source/Sources/agent-memory && npm install
export PMEM_API=http://mac-mini:4100     # thêm vào ~/.zshrc
node /Users/jack/Source/Sources/agent-memory/src/cli.ts projects
```

Skill nằm trong repo (`skills/agent-memory/`) — symlink vào `~/.claude/skills/agent-memory`, chi tiết ở README.

- Có `PMEM_API` → mọi lệnh gọi API của mac-mini; không có → mở DB local (chỉ đúng trên mac-mini).
- Project nhận theo **git remote** nên clone ở đâu cũng khớp. Project không có remote → truyền `-p <slug>`.
- `backfill-remote` chỉ chạy được trên mac-mini (dò git trên đĩa máy chủ).
- Lỗi `Không kết nối được PMEM_API` → kiểm tra Tailscale trên máy này và mac-mini.

## Mô hình dữ liệu

```
project
 └─ section  (## heading, có type)   [sN]
     ├─ entry (1 bullet / 1 khối md)  [eN]
     └─ section con (### — tối đa 2 cấp)
         └─ entry
```

- `type` gắn ở **section**: `pattern | decision | pitfall | process | preference | note | todo`
- **Todo** (việc cần làm của project): ghi vào section type `todo` của project đó (chưa có thì tạo section `Todo`).
  Mỗi việc 1 entry dạng `- [ ] việc cần làm` (dashboard hiện checkbox). Làm xong → xoá entry (`del`), theo plan như mọi lệnh xoá.
- **Entry = 1 ý**: 1 bullet (kèm sub-bullet / code block của chính nó), hoặc 1 đoạn văn / bảng / code block độc lập.
  Không nhồi nhiều ý không liên quan vào 1 entry.
- `content` là markdown nguyên khối — bullet thì giữ luôn `- ` đầu dòng.
- Kiến thức dùng chung nhiều project → ghi vào project chính, gắn `--tags` (vd `hasura`).

## Lệnh ĐỌC — gọi thẳng, không cần xin phép

- `projects` — danh sách project + số entry + remote + path
- `show [-p slug] [--type T]` — cả project dạng markdown, kèm `[sN]` / `[eN]`. **Đọc cái này trước khi làm task trong project.**
- `search "<từ khoá>" [-p slug]` — full-text, gõ không dấu được (`duong` khớp `đường`), mỗi từ là prefix
- `get <eN>` — 1 entry + created/updated

## Lệnh GHI / XOÁ — BẮT BUỘC trình plan chờ user duyệt

Plan ghi rõ: project, section (có sẵn hay tạo mới + type), nội dung từng entry.

- `add-project <slug> "<name>" --path <abs path>`
- `add-section "<title>" --type T [--parent sN] [-p slug]` → in `ok sN`
- `add <sN> ["<content>"] [--ref file] [--tags a,b]` → in `ok eN`
- `update <eN> ["<content>"] [--ref file] [--tags a,b]` — chỉ đổi field được truyền
- `del <eN>` · `del-section <sN>` (xoá cả section con + entry bên trong)

Content nhiều dòng / có backtick → truyền qua stdin bằng heredoc nháy đơn:

```bash
node /Users/jack/Source/Sources/agent-memory/src/cli.ts add s5 --ref lib/csat/trackify.ts <<'EOF'
- **Tracking là phụ**: `track()` bọc `try/catch`, không `await`
  - tracking hỏng thì form vẫn phải chạy
EOF
```

## Output & lỗi

- Ghi thành công: `ok sN` / `ok eN` — dùng luôn id, không cần đọc lại.
- Lỗi: 1 dòng `ERROR: ...`, exit code 1 (sai type, section không tồn tại, quá 2 cấp heading, slug sai...).
- `Không nhận ra project từ <cwd>` → remote lẫn path đều chưa đăng ký: chạy `projects` để xem, truyền `-p <slug>`,
  hoặc `add-project` (tự lấy remote nếu thư mục là git repo).
- `Remote ... đã thuộc project "X"` → repo này đã đăng ký rồi (có thể ở folder khác) — dùng luôn project X.
- `backfill-remote` — gán remote cho project đăng ký từ trước khi có lớp định danh remote.
