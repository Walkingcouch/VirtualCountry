/** Shared data shapes. Everything in ItemPayload is encrypted before it leaves the device. */

export type AccessLevel = 'only_me' | 'people' | 'group' | 'community';
export type Gender = 'women' | 'men' | null;
export type UseKey = 'family' | 'community' | 'school' | 'research' | 'government' | 'public' | 'ai';
export type UseAnswer = 'yes' | 'no' | 'later';

export const USE_LABELS: Record<UseKey, string> = {
  family: 'Family',
  community: 'Community',
  school: 'School and teaching',
  research: 'Research (with a signed agreement)',
  government: 'Government summary',
  public: 'Public (after Cultural Authority sign-off)',
  ai: 'AI helper',
};

export interface Consent {
  given_by: string;
  method: 'app' | 'spoken' | 'written' | 'witnessed';
  witness?: string;
  uses: Record<UseKey, UseAnswer>;
  recorded_at: string;
}

export interface MediaRef {
  id: string;
  path: string;      // storage path of the encrypted file
  name: string;
  mime: string;
  nonce: string;
  key: string;        // the file's own key (base64), kept inside the encrypted item
  size: number;
}

export interface Place { x: number; y: number; label: string }

export interface ItemPayload {
  kind: 'story' | 'note' | 'recording' | 'photo' | 'observation';
  title: string;
  body: string;
  place: Place | null;
  tags: string[];
  access: { level: AccessLevel; people?: string[]; groupId?: string };
  restrictions: { gender: Gender; sacred: boolean; deceased: boolean; season: string | null };
  consent: Consent;
  labels: string[];
  media: MediaRef[];
  createdAt: string;
}

export interface Member {
  user_id: string;
  display_name: string;
  is_admin: boolean;
  content_member: boolean;
  status: 'pending' | 'active' | 'removed';
  enc_pk: string | null;
  sign_pk: string | null;
}

export interface Attestation {
  id: string;
  org_id: string;
  subject_id: string;
  claim: 'standing:women' | 'standing:men' | 'role:cultural_authority' | 'role:recovery_keeper';
  issuer_id: string;
  issued_at: string;
  sig: string;
  revoked_at: string | null;
}

export interface Group { id: string; org_id: string; name: string; kind: string; members: string[] }

export const itemAd = (itemId: string, version: number) => `vc-item|${itemId}|${version}`;
export const msgAd = (convId: string) => `vc-msg|${convId}`;

/** Traditional Knowledge labels used in the demo. Communities replace these with their own (Local Contexts). */
export const TK_LABELS: Record<string, string> = {
  'tk-attribution': 'TK Attribution: credit the knowledge holders as they ask',
  'tk-community-use': 'TK Community Use Only',
  'tk-women': "TK Women's Restricted",
  'tk-men': "TK Men's Restricted",
  'tk-seasonal': 'TK Seasonal',
  'tk-verified': 'TK Verified by community',
  'tk-non-commercial': 'TK Non-Commercial',
};
