/* eslint-disable @next/next/no-img-element */
/**
 * First Geospatial logo: the Country mark plus the wordmark.
 * The wordmark is white and gold, so it is made for dark backgrounds (ink).
 * - variant "full": mark + name + "People | Place | Possibilities" (sign-in, set-up, unlock screens)
 * - variant "compact": mark + name only, for the app header where space is tight
 * - variant "mark": the Country mark on its own
 * The className sets the height of the whole logo (for example h-12).
 */
export default function Logo({ className = 'h-10', variant = 'full' }: { className?: string; variant?: 'full' | 'compact' | 'mark' }) {
  const label = 'First Geospatial: People, Place, Possibilities';
  if (variant === 'mark') return <img src="/brand/mark.png" alt={label} className={`${className} w-auto`} />;
  return (
    <span className={`${className} inline-flex items-center gap-[.35em] max-w-full`} role="img" aria-label={label}>
      <img src="/brand/mark.png" alt="" className="h-full w-auto shrink-0" />
      <img
        src={variant === 'full' ? '/brand/wordmark.png' : '/brand/wordmark-name.png'}
        alt=""
        className={`${variant === 'full' ? 'h-[62%]' : 'h-[40%]'} w-auto min-w-0 max-w-full object-contain object-left`}
      />
    </span>
  );
}
