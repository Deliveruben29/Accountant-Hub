import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, FileText, BarChart3, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { t } = useTranslation();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = () => {
    setLoggingIn(true);
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base || "/")}`;
  };

  const features = [
    { icon: FileText, key: "feature1" },
    { icon: BarChart3, key: "feature2" },
    { icon: TrendingUp, key: "feature3" },
    { icon: Tags, key: "feature4" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">Accountancy</span>
          </div>

          <div>
            <h1 className="text-4xl font-bold text-foreground leading-tight">
              {t("auth.welcome")}
            </h1>
            <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
              {t("auth.desc")}
            </p>
          </div>

          <ul className="space-y-3">
            {features.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 text-foreground">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm">{t(`auth.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl shadow-black/5">
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold text-foreground">{t("auth.logIn")}</h2>
            <p className="text-muted-foreground text-sm">{t("auth.desc")}</p>
          </div>

          <Button
            className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20"
            onClick={handleLogin}
            disabled={loggingIn}
          >
            {loggingIn ? t("auth.loggingIn") : t("auth.logIn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
