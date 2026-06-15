export function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="page-head">
      <h1 className="page-head__title">{title}</h1>
      {subtitle && <p className="page-head__subtitle">{subtitle}</p>}
    </div>
  );
}
