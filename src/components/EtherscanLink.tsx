import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { contractUrl, txUrl, addressUrl } from "@/lib/explorer";
import { shortenAddress, CONTRACT_ADDRESS } from "@/lib/contract";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Variant = "button" | "link" | "pill";

interface BaseProps {
  className?: string;
  label?: string;
  variant?: Variant;
}

interface ContractProps extends BaseProps {
  kind: "contract";
  address?: string;
  showCopy?: boolean;
}
interface TxProps extends BaseProps {
  kind: "tx";
  hash: string;
}
interface AddressProps extends BaseProps {
  kind: "address";
  address: string;
  showCopy?: boolean;
}

type Props = ContractProps | TxProps | AddressProps;

/**
 * Unified Etherscan deep-link control. Use everywhere the user might want to
 * jump to the on-chain record (contract page, transaction, or address).
 */
export const EtherscanLink = (props: Props) => {
  const [copied, setCopied] = useState(false);

  const { href, displayDefault, valueToCopy } = (() => {
    if (props.kind === "tx") {
      return {
        href: txUrl(props.hash),
        displayDefault: `${props.hash.slice(0, 10)}…${props.hash.slice(-6)}`,
        valueToCopy: props.hash,
      };
    }
    if (props.kind === "address") {
      return {
        href: addressUrl(props.address),
        displayDefault: shortenAddress(props.address, 6),
        valueToCopy: props.address,
      };
    }
    const addr = props.address ?? CONTRACT_ADDRESS;
    return {
      href: contractUrl(addr),
      displayDefault: shortenAddress(addr, 6),
      valueToCopy: addr,
    };
  })();

  const showCopy =
    (props.kind === "contract" || props.kind === "address") && props.showCopy;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valueToCopy);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  const variant = props.variant ?? "link";
  const label = props.label ?? displayDefault;

  if (variant === "button") {
    return (
      <div className={cn("inline-flex items-center gap-2", props.className)}>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary-glow"
        >
          <a href={href} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {label}
          </a>
        </Button>
        {showCopy && (
          <Button
            variant="ghost"
            size="icon"
            onClick={copy}
            aria-label="Copy address"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-mono",
          props.className
        )}
      >
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-primary hover:text-primary-glow"
        >
          {label}
          <ExternalLink className="h-3 w-3" />
        </a>
        {showCopy && (
          <button
            onClick={copy}
            aria-label="Copy"
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
      </div>
    );
  }

  // link
  return (
    <span className={cn("inline-flex items-center gap-1.5", props.className)}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:text-primary-glow underline-offset-2 hover:underline font-mono text-xs"
      >
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
      {showCopy && (
        <button
          onClick={copy}
          aria-label="Copy"
          className="text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
};
