import { NextResponse } from "next/server";
import { requireSupportApi, SupportApiPermission } from "@/lib/auth/support-api-auth";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/preferences/PreferencesTypes";
import { mergePrefs } from "@/preferences/PreferencesService";

export const runtime = "nodejs";

const memoryStore = new Map<string, UserPreferences>();

export async function GET(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;
  const prefs = memoryStore.get(auth.user.id) ?? DEFAULT_PREFERENCES;
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: Request) {
  const auth = await requireSupportApi(SupportApiPermission.read, req);
  if (auth instanceof NextResponse) return auth;
  let body: { preferences?: Partial<UserPreferences> };
  try {
    body = (await req.json()) as { preferences?: Partial<UserPreferences> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const merged = mergePrefs({ ...(memoryStore.get(auth.user.id) ?? DEFAULT_PREFERENCES), ...body.preferences });
  memoryStore.set(auth.user.id, merged);
  return NextResponse.json({ preferences: merged });
}
