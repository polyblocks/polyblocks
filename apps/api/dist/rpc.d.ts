import { ethers } from "ethers";
export declare function getPolygonProvider(): Promise<ethers.providers.JsonRpcProvider>;
export declare function getGasOverrides(provider: ethers.providers.JsonRpcProvider): Promise<{
    maxFeePerGas: ethers.BigNumber;
    maxPriorityFeePerGas: ethers.BigNumber;
}>;
//# sourceMappingURL=rpc.d.ts.map