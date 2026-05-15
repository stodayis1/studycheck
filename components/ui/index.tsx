import { type SubmissionStatus, STATUS_CONFIG } from '@/types'

export function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function Badge({ children, variant = 'gray', size = 'md', className }: {
  children: React.ReactNode
  variant?: 'blue'|'green'|'orange'|'red'|'gray'|'indigo'|'purple'
  size?: 'sm'|'md'
  className?: string
}) {
  const variants = {
    blue:'bg-blue-100 text-blue-700', green:'bg-green-100 text-green-700',
    orange:'bg-orange-100 text-orange-700', red:'bg-red-100 text-red-600',
    gray:'bg-gray-100 text-gray-600', indigo:'bg-indigo-100 text-indigo-700',
    purple:'bg-purple-100 text-purple-700',
  }
  return (
    <span className={cx('inline-flex items-center font-medium rounded-full', size==='sm'?'px-2 py-0.5 text-xs':'px-2.5 py-1 text-xs', variants[variant], className)}>
      {children}
    </span>
  )
}

export function StatusBadge({ status, size='md' }: { status: SubmissionStatus; size?:'sm'|'md' }) {
  const config = STATUS_CONFIG[status]
  const variantMap: Record<SubmissionStatus,'blue'|'green'|'orange'|'red'|'gray'|'indigo'|'purple'> = {
    not_started:'gray', in_progress:'blue', submitted:'green',
    checked:'indigo', need_retry:'orange', late:'red',
  }
  return <Badge variant={variantMap[status]} size={size}><span className="mr-0.5">{config.icon}</span>{config.label}</Badge>
}

export function Card({ children, className, padding='md', onClick, hover=false }: {
  children: React.ReactNode; className?: string
  padding?:'none'|'sm'|'md'|'lg'; onClick?: ()=>void; hover?:boolean
}) {
  const padMap = { none:'', sm:'p-3', md:'p-4', lg:'p-5' }
  return (
    <div className={cx('bg-white rounded-2xl border border-gray-100 shadow-sm', padMap[padding], hover&&'cursor-pointer transition-all hover:shadow-md hover:border-blue-100 active:scale-[0.99]', className)} onClick={onClick}>
      {children}
    </div>
  )
}

export function SectionCard({ title, subtitle, children, action, className }: {
  title: string; subtitle?: string; children: React.ReactNode
  action?: React.ReactNode; className?: string
}) {
  return (
    <Card className={cx('overflow-hidden', className)} padding="none">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  )
}

export function ProgressBar({ value, size='md', showLabel=false, className }: {
  value: number; size?:'sm'|'md'; showLabel?:boolean; className?:string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  const color = clamped>=80?'bg-green-500':clamped>=50?'bg-blue-500':clamped>=30?'bg-orange-400':'bg-red-400'
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className={cx('flex-1 bg-gray-100 rounded-full overflow-hidden', size==='sm'?'h-1.5':'h-2')}>
        <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{width:`${clamped}%`}} />
      </div>
      {showLabel && <span className="text-xs font-semibold text-gray-600 min-w-[32px] text-right">{clamped}%</span>}
    </div>
  )
}

export function StatCard({ label, value, sub, accent='blue', icon }: {
  label:string; value:string|number; sub?:string
  accent?:'blue'|'green'|'orange'|'red'|'gray'; icon?:string
}) {
  const colors = {
    blue:{bg:'bg-blue-50',text:'text-blue-600',icon:'bg-blue-100'},
    green:{bg:'bg-green-50',text:'text-green-600',icon:'bg-green-100'},
    orange:{bg:'bg-orange-50',text:'text-orange-600',icon:'bg-orange-100'},
    red:{bg:'bg-red-50',text:'text-red-500',icon:'bg-red-100'},
    gray:{bg:'bg-gray-50',text:'text-gray-600',icon:'bg-gray-100'},
  }[accent]
  return (
    <div className={cx('rounded-2xl p-4 flex flex-col gap-1', colors.bg)}>
      {icon && <div className={cx('w-8 h-8 rounded-lg flex items-center justify-center text-base mb-1', colors.icon)}>{icon}</div>}
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={cx('text-2xl font-bold', colors.text)}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export function EmptyState({ icon='📋', title, description, action }: {
  icon?:string; title:string; description?:string; action?:React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-xs text-gray-400 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Button({ children, variant='primary', size='md', fullWidth=false, loading=false, disabled, className, ...props }: {
  children: React.ReactNode; variant?:'primary'|'secondary'|'ghost'|'danger'
  size?:'sm'|'md'|'lg'; fullWidth?:boolean; loading?:boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
    secondary:'bg-gray-100 text-gray-700 hover:bg-gray-200',
    ghost:'bg-transparent text-blue-600 hover:bg-blue-50',
    danger:'bg-red-500 text-white hover:bg-red-600',
  }
  const sizes = { sm:'px-3 py-1.5 text-xs rounded-lg', md:'px-4 py-2.5 text-sm rounded-xl', lg:'px-5 py-3 text-base rounded-xl' }
  return (
    <button disabled={disabled||loading} className={cx('font-semibold transition-all duration-150 flex items-center justify-center gap-2', variants[variant], sizes[size], fullWidth&&'w-full', (disabled||loading)&&'opacity-50 cursor-not-allowed', className)} {...props}>
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx('border-gray-100', className)} />
}

export function ItemTypeIcon({ type }: { type: 'video'|'textbook'|'worksheet' }) {
  const config = {
    video:{icon:'▶',label:'영상',color:'bg-purple-100 text-purple-600'},
    textbook:{icon:'📖',label:'교재',color:'bg-blue-100 text-blue-600'},
    worksheet:{icon:'📄',label:'학습지',color:'bg-green-100 text-green-600'},
  }[type]
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium', config.color)}>
      <span>{config.icon}</span>{config.label}
    </span>
  )
}