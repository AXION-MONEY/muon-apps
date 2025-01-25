const {ethCall, Web3} = MuonAppUtils;

const web3 = new Web3();
const chainId = 1;
const USDE_ADDRESS = "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3";
const S_USDE_ADDRESS = "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497";
const S_FRAX_ADDRESS = "0xA663B02CF0a4b149d2aD41910CB81e23e1c41c32";
const POT_ADDRESS = "0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7";
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_ABI = [{
    "inputs": [{
        "internalType": "bool",
        "name": "requireSuccess",
        "type": "bool"
    }, {
        "components": [{"internalType": "address", "name": "target", "type": "address"}, {
            "internalType": "bytes",
            "name": "callData",
            "type": "bytes"
        }], "internalType": "struct Multicall3.Call[]", "name": "calls", "type": "tuple[]"
    }],
    "name": "tryBlockAndAggregate",
    "outputs": [{"internalType": "uint256", "name": "blockNumber", "type": "uint256"}, {
        "internalType": "bytes32",
        "name": "blockHash",
        "type": "bytes32"
    }, {
        "components": [{"internalType": "bool", "name": "success", "type": "bool"}, {
            "internalType": "bytes",
            "name": "returnData",
            "type": "bytes"
        }], "internalType": "struct Multicall3.Result[]", "name": "returnData", "type": "tuple[]"
    }],
    "stateMutability": "payable",
    "type": "function"
}];

const callsData = {
    sUsdeCalls: [
        [MULTICALL_ADDRESS, "0x0f28c97d"],  // Multicall3.getCurrentBlockTimestamp()
        [S_USDE_ADDRESS, "0x18160ddd"],  // sUSDe.totalSupply()
        [USDE_ADDRESS, `0x70a08231000000000000000000000000${S_USDE_ADDRESS.toLowerCase().slice(2)}`],  // USDe.balanceOf(sUSDe)
        [S_USDE_ADDRESS, "0x20950933"],  // sUSDe.lastDistributionTimestamp()
        [S_USDE_ADDRESS, "0x00728f76"]  // sUSDe.vestingAmount()
    ],
    sFraxCalls: [
        [MULTICALL_ADDRESS, "0x0f28c97d"],  // Multicall3.getCurrentBlockTimestamp()
        [S_FRAX_ADDRESS, "0x18160ddd"],  // sFRAX.totalSupply()
        [S_FRAX_ADDRESS, "0x61c1c5e9"],  // sFRAX.storedTotalAssets()
        [S_FRAX_ADDRESS, "0x5ebae566"],  // sFRAX.rewardsCycleData()
        [S_FRAX_ADDRESS, "0xbd6f3603"],  // sFRAX.lastRewardsDistribution()
        [S_FRAX_ADDRESS, "0x2af98d6d"]  // sFRAX.maxDistributionPerSecondPerAsset()
    ],
    sDaiCalls: [
        [MULTICALL_ADDRESS, "0x0f28c97d"],  // Multicall3.getCurrentBlockTimestamp()
        [POT_ADDRESS, "0x487bf082"],  // pot.dsr()
        [POT_ADDRESS, "0xc92aecc4"],  // pot.chi()
        [POT_ADDRESS, "0x20aba08b"]  // pot.rho()
    ]
};


const Axion = {
    APP_NAME: "axion",
    useFrost: true,

    getSUsdeStateVariables: async function (blockNumber) {
        const {returnData} = await ethCall(
            MULTICALL_ADDRESS,
            "tryBlockAndAggregate",
            [true, callsData.sUsdeCalls],
            MULTICALL_ABI,
            chainId,
            blockNumber
        );
        const [blockTimestamp, totalSupply, balance, lastDistributionTimestamp, vestingAmount] = returnData.map(item => web3.eth.abi.decodeParameter('uint256', item.returnData).toString());
        return {totalSupply, balance, lastDistributionTimestamp, vestingAmount, blockNumber, blockTimestamp};
    },

    getSFraxStateVariables: async function (blockNumber) {
        const {returnData} = await ethCall(
            MULTICALL_ADDRESS,
            "tryBlockAndAggregate",
            [true, callsData.sFraxCalls],
            MULTICALL_ABI,
            chainId,
            blockNumber
        );
        const blockTimestamp = web3.eth.abi.decodeParameter("uint256", returnData[0].returnData).toString();
        const totalSupply = web3.eth.abi.decodeParameter("uint256", returnData[1].returnData).toString();
        const storedTotalAssets = web3.eth.abi.decodeParameter("uint256", returnData[2].returnData).toString();
        const [cycleEnd, lastSync, rewardCycleAmount, _] = Object.values(web3.eth.abi.decodeParameter("(uint40,uint40,uint216)", returnData[3].returnData)).map(item => item.toString());
        const lastRewardsDistribution = web3.eth.abi.decodeParameter("uint256", returnData[4].returnData).toString();
        const maxDistributionPerSecondPerAsset = web3.eth.abi.decodeParameter("uint256", returnData[5].returnData).toString();
        return {
            totalSupply,
            storedTotalAssets,
            cycleEnd,
            lastSync,
            rewardCycleAmount,
            lastRewardsDistribution,
            maxDistributionPerSecondPerAsset,
            blockNumber,
            blockTimestamp
        };
    },

    getSDaiStateVariables: async function (blockNumber) {
        const {returnData} = await ethCall(
            MULTICALL_ADDRESS,
            "tryBlockAndAggregate",
            [true, callsData.sDaiCalls],
            MULTICALL_ABI,
            chainId,
            blockNumber
        );
        const [blockTimestamp, dsr, chi, rho] = returnData.map(item => web3.eth.abi.decodeParameter('uint256', item.returnData).toString());
        return {dsr, chi, rho, blockNumber, blockTimestamp};
    },

    onRequest: async function (request) {
        let {method, data: {params}} = request;
        switch (method) {
            case "susde-state-variables": {
                return await this.getSUsdeStateVariables(params.blockNumber);
            }
            case "sfrax-state-variables": {
                return await this.getSFraxStateVariables(params.blockNumber);
            }
            case "sdai-state-variables": {
                return await this.getSDaiStateVariables(params.blockNumber);
            }
            default:
                throw {message: `invalid method ${method}`};
        }
    },

    signParams: function (request, result) {
        switch (request.method) {
            case "susde-state-variables": {
                const {
                    totalSupply,
                    balance,
                    lastDistributionTimestamp,
                    vestingAmount,
                    blockNumber,
                    blockTimestamp
                } = result;
                return [
                    {name: "blockNumber", type: "uint256", value: blockNumber},
                    {name: "blockTimestamp", type: "uint256", value: blockTimestamp},
                    {name: "totalSupply", type: "uint256", value: totalSupply},
                    {name: "balance", type: "uint256", value: balance},
                    {name: "lastDistributionTimestamp", type: "uint256", value: lastDistributionTimestamp},
                    {name: "vestingAmount", type: "uint256", value: vestingAmount},
                    {name: "token", type: "bytes", value: "susde"}
                ];
            }
            case "sfrax-state-variables": {
                const {
                    totalSupply,
                    storedTotalAssets,
                    cycleEnd,
                    lastSync,
                    rewardCycleAmount,
                    lastRewardsDistribution,
                    maxDistributionPerSecondPerAsset,
                    blockNumber,
                    blockTimestamp
                } = result;
                return [
                    {name: "blockNumber", type: "uint256", value: blockNumber},
                    {name: "blockTimestamp", type: "uint256", value: blockTimestamp},
                    {name: "totalSupply", type: "uint256", value: totalSupply},
                    {name: "storedTotalAssets", type: "uint256", value: storedTotalAssets},
                    {name: "rewardsCycleData.cycleEnd", type: "uint256", value: cycleEnd},
                    {name: "rewardsCycleData.lastSync", type: "uint256", value: lastSync},
                    {name: "rewardsCycleData.rewardCycleAmount", type: "uint256", value: rewardCycleAmount},
                    {name: "lastRewardsDistribution", type: "uint256", value: lastRewardsDistribution},
                    {name: "maxDistributionPerSecondPerAsset", type: "uint256", value: maxDistributionPerSecondPerAsset},
                    {name: "token", type: "bytes", value: "sfrax"}
                ];
            }
            case "sdai-state-variables": {
                const {
                    dsr,
                    chi,
                    rho,
                    blockNumber,
                    blockTimestamp
                } = result;
                return [
                    {name: "blockNumber", type: "uint256", value: blockNumber},
                    {name: "blockTimestamp", type: "uint256", value: blockTimestamp},
                    {name: "dsr", type: "uint256", value: dsr},
                    {name: "chi", type: "uint256", value: chi},
                    {name: "rho", type: "uint256", value: rho},
                    {name: "token", type: "bytes", value: "sdai"}
                ];
            }
            default:
                throw {message: `Unknown method: ${request.method}`};
        }
    }
};

module.exports = Axion;