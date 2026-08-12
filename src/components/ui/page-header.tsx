type PageHeaderProps = {
  eyebrow: string;
  title: string;
};

export function PageHeader({ eyebrow, title }: PageHeaderProps) {
  return (
    <header className="page-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
    </header>
  );
}
