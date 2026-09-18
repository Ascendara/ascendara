

const TorboxIcon = ({ className = "", style = {}, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 1500 1500"
    className={className}
    style={style}
    {...props}
  >
    <polygon
      fill="#00444D"
      points="749.99,749.99 749.99,1191.96 367.25,970.97 367.25,529.01"
    />
    <polygon
      fill="#34BA90"
      points="1132.75,529.01 1132.75,970.97 749.99,1191.96 749.99,749.99 872.87,679.05 956.71,630.66"
    />
    <polygon
      fill="#52A153"
      points="1132.75,529.01 749.99,749.99 367.25,529.01 749.99,308.04"
    />
    <polygon
      fill="#FFFFFF"
      points="1043.04,739.36 958.66,1057.08 952.4,851.84 839.71,915.39 872.87,679.05 956.71,630.66 931.81,799.21"
    />
  </svg>
);

export default TorboxIcon;
