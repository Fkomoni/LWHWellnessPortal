interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'red' | 'orange' | 'green' | 'blue' | 'purple';
  icon?: React.ReactNode;
}

const colorMap = {
  red: 'text-brand-red',
  orange: 'text-brand-orange',
  green: 'text-green-600',
  blue: 'text-blue-600',
  purple: 'text-purple-600',
};

export default function StatCard({ label, value, sub, color = 'red', icon }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-grey-4 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-grey-3">{icon}</span>}
      </div>
      <div className={`text-3xl font-bold mt-1 ${colorMap[color]}`}>{value}</div>
      {sub && <div className="text-xs text-grey-4 mt-0.5">{sub}</div>}
    </div>
  );
}
