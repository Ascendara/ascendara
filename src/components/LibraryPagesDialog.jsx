import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

// pages: [{ id, label, icon, visible, hint? }]
const LibraryPagesDialog = ({ open, onOpenChange, pages, onToggle }) => {
  const { t } = useLanguage();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border bg-background">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("library.pagesDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("library.pagesDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          {pages.map(page => (
            <label
              key={page.id}
              htmlFor={`library-page-${page.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/60"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  page.visible
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {page.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {page.label}
                </span>
                {page.hint && (
                  <span className="truncate text-xs text-muted-foreground">
                    {page.hint}
                  </span>
                )}
              </span>
              <Switch
                id={`library-page-${page.id}`}
                checked={page.visible}
                onCheckedChange={checked => onToggle(page.id, checked)}
              />
            </label>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogAction className="bg-primary text-secondary">
            {t("library.pagesDialog.done")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LibraryPagesDialog;
