import { integrationProviders } from "@/lib/integrations/catalogue";
import styles from "@/components/integrations/integrations.module.css";
export default function Loading() {
  return <div><h1>Integrations</h1><div className={styles.grid}>{integrationProviders.map(provider => <section className={styles.card} key={provider.key}><div className={styles.header}><h2>{provider.name}</h2><span className={styles.icon} aria-hidden="true">{provider.icon}</span></div><p className={styles.description}>{provider.description}</p><p role="status">Checking configuration...</p></section>)}</div></div>;
}
