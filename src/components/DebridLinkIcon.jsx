// Generic badge used to mark Debrid-Link in the UI (not the official logo).
const DebridLinkIcon = ({ className = "", style = {}, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    className={className}
    style={style}
    {...props}
  >
    <rect x="2" y="2" width="60" height="60" rx="14" className="fill-primary" />
    <path
      d="M28 36a8 8 0 0 0 11.3 0l6-6a8 8 0 0 0-11.3-11.3l-2 2M36 28a8 8 0 0 0-11.3 0l-6 6A8 8 0 0 0 30 45.3l2-2"
      fill="none"
      className="stroke-background"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default DebridLinkIcon;
