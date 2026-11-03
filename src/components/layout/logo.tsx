/** Atomgrid mark: green ring with a leaf, and a navy "A" with a leaf across its base. */
export function AtomgridMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label="Atomgrid">
      <path d="M36 6.5 a29.5 29.5 0 1 1 -21 8.8" fill="none" stroke="#4f9f6a" strokeWidth="7" strokeLinecap="round" />
      <path d="M13.5 13.8 q11 -2.5 14.5 7 q-11 3.2 -14.5 -7 z" fill="#4f9f6a" />
      <path
        fillRule="evenodd"
        fill="#13203a"
        d="M36 20 L51 53 L43.6 53 L40.8 46.4 L31.2 46.4 L28.4 53 L21 53 Z M33.6 40.4 L38.4 40.4 L36 30.6 Z"
      />
      <path d="M25.5 45 q10.5 5.6 21 0 q-10.5 8.6 -21 1 z" fill="#4f9f6a" />
    </svg>
  );
}

/** Logo lockup on a white chip, so the navy reads on dark backgrounds. */
export function AtomgridLogo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[11px] bg-[#fff] py-1.5 pl-2 pr-3 shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
      <AtomgridMark size={size} />
      <span className="text-[17px] font-bold tracking-tight text-[#13203a]">Atomgrid</span>
    </span>
  );
}
