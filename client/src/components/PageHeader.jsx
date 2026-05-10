/**
 * @param {{ title: string, subtitle?: string, actions?: import('react').ReactNode }} props
 */
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header mb-6">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
