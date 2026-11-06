// Generic badge used to mark Premiumize in the UI (not the official logo).
const PremiumizeIcon = ({ className = "", style = {}, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    className={className}
    style={style}
    {...props}
  >
    <rect x="2" y="2" width="60" height="60" rx="14" className="fill-primary" />
    <path
      d="M24 48V17h9a10 10 0 0 1 0 20h-9"
      fill="none"
      className="stroke-background"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default PremiumizeIcon;
