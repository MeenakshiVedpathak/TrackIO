import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FileDown, FileSpreadsheet, Printer, DollarSign, TrendingUp, Wallet, Activity,
  Users, Trophy, Briefcase, TriangleAlert, Lightbulb,
} from 'lucide-react';
import AIPageHeader from '@/components/ai/AIPageHeader';
import PriorityBadge from '@/components/ai/PriorityBadge';
import { useAIQuery } from '@/hooks/useAIQuery';
import { useDashboardAnalytics } from '@/hooks/useDashboard';
import { useServicePOs } from '@/hooks/useServicePOs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercentage } from '@/utils/formatters';

const now = new Date();
const DEFAULT_FY = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
const FY_OPTIONS = [DEFAULT_FY - 1, DEFAULT_FY, DEFAULT_FY + 1];
// Timesheets are only uploaded at month-end, so bench status (utilization-dependent) is
// asked about the last COMPLETED month rather than left to default to the empty current one.
const LAST_MONTH_LABEL = dayjs().subtract(1, 'month').format('MMMM YYYY');

const Tile = ({ icon: Icon, label, value, loading }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        {loading ? <Skeleton className="h-5 w-20 mt-1" /> : <p className="text-lg font-bold tabular-nums truncate">{value}</p>}
      </div>
    </CardContent>
  </Card>
);

const ExecutiveReport = () => {
  const [fiscalYear, setFiscalYear] = useState(DEFAULT_FY);
  const { data: analytics, isLoading: analyticsLoading } = useDashboardAnalytics({ fiscalYear });
  const { data: poRes } = useServicePOs({ limit: 200 });
  const financials = useAIQuery();
  const summary = useAIQuery();
  const bench = useAIQuery();

  useEffect(() => {
    financials.ask(`What is our total revenue, cost, and profit for fiscal year ${fiscalYear}?`);
    summary.ask('Give me an executive summary for this fiscal year, including risks and recommendations.');
    bench.ask(`How many resources were on the bench in ${LAST_MONTH_LABEL} and what should we do about it?`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  const tiles = analytics?.tiles ?? {};
  const topClients = useMemo(
    () => [...(analytics?.charts?.hours_by_client ?? [])].sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0)).slice(0, 5),
    [analytics],
  );
  const topProjects = useMemo(
    () => [...(poRes?.data ?? [])].sort((a, b) => (b.po_value ?? 0) - (a.po_value ?? 0)).slice(0, 5),
    [poRes],
  );

  const revenueData = financials.raw?.data?.revenue;
  const profitData = financials.raw?.data?.profit;

  const fyLabel = `FY ${fiscalYear}–${String(fiscalYear + 1).slice(-2)}`;

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Fiscal Year': fyLabel,
      'Total Hours': tiles.total_hours ?? '',
      'Total Cost': tiles.total_cost ?? '',
      'Utilization %': tiles.utilization_pct ?? '',
      'Revenue': revenueData?.total_po_value ?? '',
      'Profit': profitData?.profit ?? '',
      'Active Employees': tiles.active_employees ?? '',
      'Active Clients': tiles.active_clients ?? '',
    }]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      topClients.map((c) => ({ Client: c.client_name, Hours: c.hours })),
    ), 'Top Clients');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      topProjects.map((p) => ({ Project: p.service_po_name, Client: p.client_name, 'PO Value': p.po_value, Status: p.status })),
    ), 'Top Projects');
    XLSX.writeFile(wb, `executive_report_${fiscalYear}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Executive Report — ${fyLabel}`, 14, 15);

    autoTable(doc, {
      startY: 22,
      head: [['Metric', 'Value']],
      body: [
        ['Revenue', revenueData?.total_po_value != null ? formatCurrency(revenueData.total_po_value) : '—'],
        ['Profit', profitData?.profit != null ? formatCurrency(profitData.profit) : '—'],
        ['Total Cost', tiles.total_cost != null ? formatCurrency(tiles.total_cost) : '—'],
        ['Utilization', tiles.utilization_pct != null ? formatPercentage(tiles.utilization_pct) : '—'],
        ['Active Employees', tiles.active_employees ?? '—'],
        ['Active Clients', tiles.active_clients ?? '—'],
      ],
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Top Clients', 'Hours']],
      body: topClients.map((c) => [c.client_name, formatNumber(c.hours)]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Top Projects', 'Client', 'PO Value', 'Status']],
      body: topProjects.map((p) => [p.service_po_name, p.client_name, formatCurrency(p.po_value), p.status]),
    });

    if (summary.answer) {
      let y = doc.lastAutoTable.finalY + 12;
      doc.setFontSize(12);
      doc.text('Summary', 14, y);
      y += 6;
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(summary.answer.summary ?? '', 180);
      doc.text(lines, 14, y);
    }

    doc.save(`executive_report_${fiscalYear}.pdf`);
  };

  return (
    <div className="pb-8">
      <style>{'@media print { aside, header { display: none !important; } }'}</style>

      <AIPageHeader
        title="Executive Report"
        description="Revenue, cost, utilization, top clients & projects, risks and recommendations."
        actions={
          <>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium"
            >
              {FY_OPTIONS.map((fy) => (
                <option key={fy} value={fy}>FY {fy}–{String(fy + 1).slice(-2)}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tile icon={TrendingUp} label="Revenue" loading={financials.loading} value={revenueData?.total_po_value != null ? formatCurrency(revenueData.total_po_value) : '—'} />
        <Tile icon={Wallet} label="Profit" loading={financials.loading} value={profitData?.profit != null ? formatCurrency(profitData.profit) : '—'} />
        <Tile icon={DollarSign} label="Total Cost" loading={analyticsLoading} value={tiles.total_cost != null ? formatCurrency(tiles.total_cost) : '—'} />
        <Tile icon={Activity} label="Utilization" loading={analyticsLoading} value={tiles.utilization_pct != null ? formatPercentage(tiles.utilization_pct) : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Trophy className="h-4 w-4 text-primary" /> Top Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topClients.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No client data yet.</p>
            ) : topClients.map((c) => (
              <div key={c.client_name} className="flex items-center justify-between text-sm">
                <span className="truncate">{c.client_name}</span>
                <span className="font-semibold tabular-nums shrink-0 ml-2">{formatNumber(c.hours)} hrs</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-primary" /> Top Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No project data yet.</p>
            ) : topProjects.map((p) => (
              <div key={p.service_po_name + p.client_name} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{p.service_po_name} <span className="text-muted-foreground">· {p.client_name}</span></span>
                <span className="font-semibold tabular-nums shrink-0">{formatCurrency(p.po_value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> Bench</CardTitle>
          </CardHeader>
          <CardContent>
            {bench.loading ? <Skeleton className="h-12 w-full" /> : (
              <p className="text-sm text-foreground/85 leading-relaxed">{bench.answer?.summary ?? bench.error ?? '—'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Overall Priority</CardTitle>
            <PriorityBadge priority={summary.answer?.priority} />
          </CardHeader>
          <CardContent>
            {summary.loading ? <Skeleton className="h-12 w-full" /> : (
              <p className="text-sm text-foreground/85 leading-relaxed">{summary.answer?.summary ?? summary.error ?? '—'}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><TriangleAlert className="h-4 w-4 text-amber-500" /> Risks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.loading ? <Skeleton className="h-12 w-full" /> : (summary.answer?.findings?.length
              ? summary.answer.findings.map((f, i) => <p key={i} className="text-sm text-foreground/85">• {f}</p>)
              : <p className="text-xs text-muted-foreground italic">No specific risks called out.</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-primary" /> Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.loading ? <Skeleton className="h-12 w-full" /> : (summary.answer?.actions?.length
              ? summary.answer.actions.map((a, i) => <p key={i} className="text-sm text-foreground/85">• {a}</p>)
              : <p className="text-xs text-muted-foreground italic">No specific recommendations.</p>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExecutiveReport;
