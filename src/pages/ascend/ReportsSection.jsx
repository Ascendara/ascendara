import { useEffect, useState } from "react";
import SectionHeader from "./SectionHeader";
import SectionLoading from "./SectionLoading";
import { EmptyState, Panel, StatStrip } from "./primitives";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  CircleDot,
  Flag,
  MessageSquareReply,
  RefreshCw,
} from "lucide-react";
import { listMyReports } from "@/services/firebase/firebaseService";

const FILTERS = ["all", "open", "fixed"];

function StatusBadge({ t, fixed }) {
  const Icon = fixed ? CheckCircle2 : CircleDot;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
        fixed ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(fixed ? "ascend.myReports.status.fixed" : "ascend.myReports.status.open")}
    </span>
  );
}

function ReportCard({ t, report, index }) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = t(`ascend.myReports.types.${report.reportType}`, {
    defaultValue: report.reportType,
  });

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
    >
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {typeLabel}
              {report.submittedAt &&
                ` • ${new Date(report.submittedAt).toLocaleDateString()}`}
            </p>
            <h3 className="mt-0.5 truncate font-semibold">
              {report.gameName || report.reason}
            </h3>
            {report.gameName && (
              <p className="truncate text-sm text-muted-foreground">{report.reason}</p>
            )}
          </div>
          <StatusBadge t={t} fixed={report.fixed} />
        </div>

        {report.details && (
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            className={`mt-3 block w-full whitespace-pre-wrap break-words text-left text-sm leading-relaxed text-muted-foreground ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {report.details}
          </button>
        )}

        {report.response && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <MessageSquareReply className="h-3.5 w-3.5" />
              {t("ascend.myReports.response")}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{report.response}</p>
          </div>
        )}

        {report.id && (
          <p className="mt-3 text-xs text-muted-foreground/70">
            {t("ascend.myReports.trackingId")}:{" "}
            <span className="font-mono">{report.id}</span>
          </p>
        )}
      </Panel>
    </motion.li>
  );
}

export default function ReportsSection({ t }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  const loadReports = async () => {
    setLoading(true);
    const result = await listMyReports();
    setReports(result.reports);
    setError(result.error);
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, []);

  const fixedCount = reports.filter(report => report.fixed).length;
  const visible = reports.filter(
    report => filter === "all" || (filter === "fixed") === report.fixed
  );

  return (
    <div className="mb-24 space-y-6">
      <SectionHeader
        icon={Flag}
        title={t("ascend.myReports.title")}
        description={t("ascend.myReports.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={loadReports} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("ascend.myReports.refresh")}
          </Button>
        }
      />

      {loading && reports.length === 0 ? (
        <SectionLoading />
      ) : error ? (
        <EmptyState
          icon={Flag}
          title={t("ascend.myReports.loadFailed")}
          description={error}
          action={
            <Button variant="outline" onClick={loadReports}>
              {t("ascend.myReports.retry")}
            </Button>
          }
        />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={t("ascend.myReports.empty")}
          description={t("ascend.myReports.emptyDescription")}
        />
      ) : (
        <>
          <StatStrip
            className="sm:grid-cols-3"
            stats={[
              {
                icon: Flag,
                label: t("ascend.myReports.filters.all"),
                value: reports.length,
              },
              {
                icon: CircleDot,
                label: t("ascend.myReports.filters.open"),
                value: reports.length - fixedCount,
              },
              {
                icon: CheckCircle2,
                label: t("ascend.myReports.filters.fixed"),
                value: fixedCount,
              },
            ]}
          />

          <div role="tablist" className="flex gap-1">
            {FILTERS.map(id => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`ascend.myReports.filters.${id}`)}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Flag} title={t("ascend.myReports.noMatches")} />
          ) : (
            <ul className="space-y-3">
              {visible.map((report, index) => (
                <ReportCard
                  key={report.id || index}
                  t={t}
                  report={report}
                  index={index}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
