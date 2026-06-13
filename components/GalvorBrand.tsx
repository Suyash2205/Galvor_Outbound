import Image from "next/image";
import Link from "next/link";

export function GalvorBrand({
  centered = false,
  href = "/dashboard",
}: {
  centered?: boolean;
  href?: string | null;
}) {
  const inner = (
    <>
      <Image
        src="/galvor-logo.png"
        alt="Galvor"
        width={centered ? 40 : 30}
        height={centered ? 40 : 30}
        className="brand-logo"
        priority
      />
      <span className="brand-wordmark">
        GAL<span>VOR</span>
      </span>
    </>
  );

  const className = `brand-lockup${centered ? " brand-lockup--center" : ""}`;

  if (href === null) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
