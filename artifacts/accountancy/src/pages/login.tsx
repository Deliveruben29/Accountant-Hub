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
    <div className="min-h-screen tbf-bg flex flex-col">
      {/* TBF Brand Banner */}
      <div className="w-full tbf-banner-glow">
        <img
          src={`${import.meta.env.BASE_URL}images/tbf-banner.png`}
          alt="Thebasefrequency"
          className="w-full object-cover"
          style={{ maxHeight: "110px", objectPosition: "center" }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">

          {/* Left: branding + features */}
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
                {t("auth.welcome")}
              </h1>
              <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
                {t("auth.desc")}
              </p>
            </div>

            <ul className="space-y-3">
              {features.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-center gap-3 text-foreground">
                  <div className="w-8 h-8 bg-primary/15 border border-primary/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">{t(`auth.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: login card */}
          <div className="bg-card border border-border/60 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
            <div className="text-center space-y-2 mb-8">
              <h2 className="text-2xl font-display font-bold text-foreground">{t("auth.logIn")}</h2>
              <p className="text-muted-foreground text-sm">{t("auth.desc")}</p>
            </div>

            <Button
              className="w-full h-12 text-base font-semibold shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleLogin}
              disabled={loggingIn}
            >
              {loggingIn ? t("auth.loggingIn") : t("auth.logIn")}
            </Button>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Powered by Thebasefrequency
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
