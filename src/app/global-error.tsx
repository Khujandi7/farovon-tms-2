"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Произошла ошибка</h1>
          <p style={{ color: "#71717a", marginBottom: 16 }}>Приложение FAROVON TMS не смогло загрузиться.</p>
          <button onClick={reset} style={{ background: "#E8342A", color: "white", border: 0, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
            Повторить
          </button>
        </div>
      </body>
    </html>
  );
}
