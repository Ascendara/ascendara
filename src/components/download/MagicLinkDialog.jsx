import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/context/LanguageContext";
import { Download, MousePointerClick, ShieldCheck, WandSparkles } from "lucide-react";

const POINTS = [
  { icon: ShieldCheck, key: "noAds" },
  { icon: MousePointerClick, key: "noClicks" },
  { icon: Download, key: "starts" },
];

export default function MagicLinkDialog({ open, onOpenChange }) {
  const { t } = useLanguage();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[440px]">
        <AlertDialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <WandSparkles className="h-5 w-5 text-primary" />
          </div>
          <AlertDialogTitle>{t("download.magicLink.title")}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t("download.magicLink.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-3 text-foreground">
          {POINTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t(`download.magicLink.points.${key}.title`)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(`download.magicLink.points.${key}.description`)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">{t("download.magicLink.hosts")}</p>

        <AlertDialogFooter>
          <AlertDialogCancel className="text-primary">
            {t("download.magicLink.gotIt")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
