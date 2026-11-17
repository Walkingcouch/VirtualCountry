import Link from 'next/link';
import type { ReactNode } from 'react';

/** Shared frame for the plain-language policy pages. Works signed in or out. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <p className="mb-4 rounded border border-[#F0D9A6] bg-[#FFF4DE] text-[#5E400B] text-sm p-3" role="note">
        <strong>Draft for legal review.</strong> This page explains how Virtual Country is meant to work, in plain language. It has not been checked by a lawyer yet and is not a final agreement.
      </p>
      <div className="label mb-1">Virtual Country · First Geospatial Pty Ltd</div>
      <h1 className="font-head font-extrabold text-3xl mb-1">{title}</h1>
      <p className="text-sm text-mute mb-6">Draft dated {updated}</p>
      <div className="legal space-y-4">{children}</div>
      <nav className="mt-8 pt-4 border-t border-line text-sm flex flex-wrap gap-x-4 gap-y-1" aria-label="Policies">
        <Link className="underline" href="/privacy">Privacy</Link>
        <Link className="underline" href="/terms">Terms of use</Link>
        <Link className="underline" href="/icip">ICIP statement</Link>
        <Link className="underline" href="/contact">Contact</Link>
        <Link className="underline" href="/">Back to Virtual Country</Link>
      </nav>
    </div>
  );
}
