/* eslint-disable @next/next/no-img-element */
export default function Logo({ className = 'h-8' }: { className?: string }) {
  return <img src="/brand/logo.png" alt="First Geospatial: People, Place, Possibilities" className={`${className} w-auto`} />;
}
