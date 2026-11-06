// Generic badge used to mark AllDebrid in the UI (not the official logo).
const AllDebridIcon = ({ className = "", style = {}, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    className={className}
    style={style}
    {...props}
  >
    <rect x="2" y="2" width="60" height="60" rx="14" className="fill-primary" />
    <path
      d="M20 46 32 18l12 28M25 37h14"
      fill="none"
      className="stroke-background"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default AllDebridIcon;
