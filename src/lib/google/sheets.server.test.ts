// @vitest-environment node
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { __resetGoogleTokenCache, buildAssertion, getSheetValues, getSpreadsheetMeta, googleConfigured } from "./sheets.server";

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SA = { type: "service_account", client_email: "tms-reader@farovon.iam.gserviceaccount.com", private_key: PEM };
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

const fetchMock = vi.fn();
beforeEach(() => {
  __resetGoogleTokenCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify(SA));
  vi.stubEnv("GOOGLE_SHEETS_API_BASE", "");
  vi.stubEnv("GOOGLE_OAUTH_TOKEN_URL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Google Sheets на сервере", () => {
  it("JWT подписан ключом сервисного аккаунта, только чтение таблиц", () => {
    const jwt = buildAssertion({ clientEmail: SA.client_email, privateKey: PEM }, "https://oauth2.googleapis.com/token", 1_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(crypto.verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
    expect(claims).toMatchObject({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", exp: 1_003_600 });
  });

  it("ключ можно задать в base64; без ключа — понятная ошибка и ни одного запроса", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", Buffer.from(JSON.stringify(SA)).toString("base64"));
    expect(googleConfigured()).toEqual({ configured: true, serviceAccountEmail: SA.client_email });
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    expect(googleConfigured().configured).toBe(false);
    const r = await getSpreadsheetMeta(ID);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("не настроен") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("листы таблицы; токен запрашивается один раз и переиспользуется", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ properties: { title: "Кадры" }, sheets: [{ properties: { sheetId: 0, title: "Сотрудники", gridProperties: { rowCount: 3000, columnCount: 12 } } }] }))
      .mockResolvedValueOnce(json({ values: [["ФИО", "Таб. №"], ["Алиев Рустам", "00123"], ["Бобоев", null]] }));
    const meta = await getSpreadsheetMeta(ID);
    expect(meta).toEqual({ ok: true, data: { title: "Кадры", tabs: [{ sheetId: 0, title: "Сотрудники", rows: 3000, columns: 12 }] } });
    const values = await getSheetValues(ID, "Сотрудники");
    expect(values).toEqual({ ok: true, data: [["ФИО", "Таб. №"], ["Алиев Рустам", "00123"], ["Бобоев", ""]] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(String(tokenInit.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    const [valuesUrl, valuesInit] = fetchMock.mock.calls[2]!;
    expect(valuesUrl).toContain(`/v4/spreadsheets/${ID}/values/`);
    expect(decodeURIComponent(valuesUrl)).toContain("'Сотрудники'!A1:BH5050");
    expect(valuesUrl).toContain("valueRenderOption=FORMATTED_VALUE");
    expect(valuesInit.headers.authorization).toBe("Bearer tok");
  });

  it("закрытая таблица: подсказка открыть доступ сервисному аккаунту", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "tok" })).mockResolvedValueOnce(json({ error: {} }, 403));
    const r = await getSpreadsheetMeta(ID);
    expect(r).toMatchObject({ ok: false, status: 403, error: expect.stringContaining(SA.client_email) });
  });

  it("неверный ключ и несуществующая таблица", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
    expect(await getSpreadsheetMeta(ID)).toMatchObject({ ok: false, error: expect.stringContaining("отклонил ключ") });
    fetchMock.mockResolvedValueOnce(json({ access_token: "tok" })).mockResolvedValueOnce(json({}, 404));
    expect(await getSpreadsheetMeta(ID)).toMatchObject({ ok: false, status: 404 });
  });

  it("имя листа с апострофом экранируется в диапазоне", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "tok" })).mockResolvedValueOnce(json({ values: [] }));
    await getSheetValues(ID, "Отдел O'Neil");
    expect(decodeURIComponent(fetchMock.mock.calls[1]![0])).toContain("'Отдел O''Neil'!A1");
  });
});
