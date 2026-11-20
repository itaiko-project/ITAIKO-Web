import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingCart, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function SiteNavActions() {
  const { t } = useTranslation("pages");
  return (
    <div className="flex items-center gap-3 md:gap-8">
      <LanguageSwitcher />
      <Button asChild size="sm" variant="outline" className="hidden md:inline-flex md:h-9 md:px-4">
        <NavLink to="/configure" aria-label={t("landing.cta.configure")}>
          <Wrench size={16} strokeWidth={1.5} aria-hidden />
          <span className="hidden md:inline">{t("landing.cta.configure")}</span>
        </NavLink>
      </Button>
      <Button asChild size="sm" className="md:h-9 md:px-4 bg-brand-fill hover:bg-brand-fill-hover text-white border-0">
        <a href="https://shop.itaiko.com/pages/shop">
          <ShoppingCart size={16} strokeWidth={1.5} aria-hidden />
          {t("landing.nav.buy")}
        </a>
      </Button>
    </div>
  );
}
