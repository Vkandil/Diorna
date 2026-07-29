import transparentLogo from "@/assets/brand/diorna-logo-transparent.png";
import beigeLogo from "@/assets/brand/diorna-logo-beige.png";

export function BrandLogo({
  className = "",
  framed = false,
}: {
  className?: string;
  framed?: boolean;
}) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={framed ? beigeLogo : transparentLogo}
      alt="Diorna"
      draggable={false}
    />
  );
}
