import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Browser client. Uses only the publishable key; every request is limited by Row Level Security. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase URL and publishable key are not configured');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vc-auth' } });
  }
  return client;
}

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
export const DEMO_PASSWORD = 'VirtualCountry-demo-2026';
export const DEMO_PASSPHRASE = 'country-demo';

export const DEMO_PEOPLE = [
  { email: 'rose.demo@example.com', name: 'Rose', role: "Elder · founding Cultural Authority · women's standing", tip: "Sees women's items, family items, and can sign public releases." },
  { email: 'tom.demo@example.com', name: 'Tom', role: "Elder · Cultural Authority · men's standing", tip: "Sees men's items. Can sign Daniel's waiting release." },
  { email: 'maya.demo@example.com', name: 'Maya', role: "Teacher · women's standing · Recovery Keeper", tip: "Sees women's and family items. Has a private 'only me' note." },
  { email: 'daniel.demo@example.com', name: 'Daniel', role: "Ranger · men's standing", tip: "Never receives women's or family keys. Drafted a release waiting for sign-off." },
  { email: 'sam.demo@example.com', name: 'Sam', role: 'Community Administrator', tip: 'Runs the community but holds no content keys. Sees zero stories.' },
  { email: 'lee.demo@example.com', name: 'Dr Lee', role: 'Researcher · partner organisation administrator', tip: 'Outside the community. Can only talk to Sam through the transparent bridge.' },
];
