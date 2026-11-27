interface WiluxLogoProps {
  size?: number;
  className?: string;
}

export function WiluxLogo({ size = 32, className = '' }: WiluxLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="12" fill="#8B5CF6" />
      <path
        d="M11 13.5L15.2 26.5L20 16.5L24.8 26.5L29 13.5"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="10.5" r="2" fill="white" />
    </svg>
  );
}
