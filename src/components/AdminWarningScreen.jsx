
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import MenuBar from "@/components/MenuBar";

const AdminWarningScreen = () => {
  const { t } = useTranslation();

  return (
    <>
      <MenuBar />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 flex items-center justify-center bg-background"
      >
        <div className="max-w-md p-8 text-center">
          <h1 className="mb-4 text-2xl font-bold text-primary">
            {t("app.admin.warning.title")}
          </h1>
          <p className="text-2lg mb-6 text-foreground">
            {t("app.admin.warning.message")}
          </p>
        </div>
      </motion.div>
    </>
  );
};

export default AdminWarningScreen;
