// Запуск mock Supabase для Playwright (webServer). Только для тестов.
import { createMockServer, PORT } from "./mock-supabase.mjs";

createMockServer().listen(PORT, "127.0.0.1", () => console.log(`mock-supabase on ${PORT}`));
