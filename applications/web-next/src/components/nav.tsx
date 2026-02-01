import { usePathname, useRouter } from "next/navigation";
import { tv } from "tailwind-variants";
import { useAppView, type AppViewType } from "./app-view";

const nav = tv({
  slots: {
    root: "flex gap-4 px-3 py-2 whitespace-nowrap font-medium border-b border-neutral-200",
    link: "text-text-secondary hover:text-text cursor-pointer",
  },
  variants: {
    active: {
      true: {
        link: "text-text",
      },
    },
  },
});

type NavItem = {
  label: string;
  href: string;
  view?: AppViewType;
};

type NavProps = {
  items: NavItem[];
};

export function Nav({ items }: NavProps) {
  const styles = nav();
  const router = useRouter();
  const pathname = usePathname();
  const { view, setView } = useAppView();

  const getIsActive = (item: NavItem) => {
    if (item.view) {
      return view === item.view;
    }
    return pathname === item.href;
  };

  const handleClick = (item: NavItem) => {
    if (item.view) {
      setView(item.view);
    } else {
      router.push(item.href);
    }
  };

  return (
    <nav className={styles.root()}>
      {items.map((item) => (
        <span
          key={item.href}
          onClick={() => handleClick(item)}
          className={nav({ active: getIsActive(item) }).link()}
        >
          {item.label}
        </span>
      ))}
    </nav>
  );
}
