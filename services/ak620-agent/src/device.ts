import type { HID as HidDeviceType } from "node-hid";

const VENDOR_ID = 0x3633;
const PRODUCT_ID = 0x0002;

export interface HidDeviceAdapter {
  write(data: number[]): number;
  close(): void;
}

export async function openAk620Device(): Promise<HidDeviceAdapter | null> {
  try {
    const nodeHid = await import("node-hid");
    const HID = nodeHid.HID as unknown as {
      new (vendorId: number, productId: number): HidDeviceType;
    };

    const dev = new HID(VENDOR_ID, PRODUCT_ID);
    return {
      write(data: number[]) {
        return dev.write(data);
      },
      close() {
        dev.close();
      },
    };
  } catch {
    return null;
  }
}
