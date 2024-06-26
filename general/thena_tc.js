const { ethCall, axios, BN } = MuonAppUtils


class AccountManager {
    static PERP_MANAGER_ABI = [{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"idToTradingCompetitionAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]
    static ACCOUNT_MANAGER_ABI = [{"inputs":[],"name":"getWeightsLength","outputs":[{"internalType":"uint256","name":"length","type":"uint256"}],"stateMutability":"view","type":"function"}];

    static perpManagerAddress = "0xE5Ccf697Efa772De24Cbd256e6d401B5872645c0"
    static defaultChainId = 56

    static async getAccountManager(tcId) {
        const { tradingCompetition } = await ethCall(AccountManager.perpManagerAddress, 'idToTradingCompetitionAddress', [tcId], AccountManager.PERP_MANAGER_ABI, AccountManager.defaultChainId);
        return tradingCompetition;
    }

    constructor(address, tcId) {
        this.address = address;
        this.tcId = tcId;
    }

    async getWeightsLen() {
        const weightsLen = await ethCall(this.address, 'getWeightsLength', [], AccountManager.ACCOUNT_MANAGER_ABI, AccountManager.defaultChainId);
        return weightsLen;
    }

}


const ThenaTCApp = {
    APP_NAME: 'thena_tc',

    postQuery: async function (query, subgraphEndpoint) {
        const result = await axios.post(subgraphEndpoint, {
            query: query
        })

        const data = result.data

        if (data.errors) {
            throw data.errors
        }

        return data.data
    },

    getPositionAndTieCounter: async function (participants, owner, tcId) {

        const accountManager = new AccountManager(await AccountManager.getAccountManager(tcId), tcId);
        const weightslen = accountManager.getWeightsLen();

        // Find all valid participants
        const validParticipants = participants.filter(participants => participants.isValid && participants.isValidDeallocate)

        // Find if owner is valid
        const isOwnerValid = validParticipants.some(participant => participant.owner.toLowerCase() === owner.toLowerCase());
        if(!isOwnerValid) throw { message: "OWNER_NOT_VALID" }
        
        // Sort all participants 
        const sortedParticipants = validParticipants.sort((a,b) => parseFloat(b.percentagePnl) - parseFloat(a.percentagePnl))

        // Find the index of the given owner
        const ownerIndex = sortedParticipants.findIndex(participants => participants.owner.toLowerCase() === owner.toLowerCase());

        // Find the given owner's percentagePnl
        const ownerPnl = sortedParticipants[ownerIndex].percentagePnl;

        // Find the first index of the users with same percentagePnl as owner
        const firstIndexSamePnl = sortedParticipants.findIndex(participant => participant.percentagePnl === ownerPnl);

        // Find all participants with the same percentagePnl as owner
        const samePnlParticipants = sortedParticipants.filter(participant => participant.percentagePnl === ownerPnl);

        // Sub 1 from tieCounter. SC handle / 0.
        const tiecounter = samePnlParticipants.length - 1;
        
        // Find the number of users that has more pnl than the ownerPnl
        const higherParticipants = sortedParticipants.filter(participant => parseFloat(participant.percentagePnl) > parseFloat(ownerPnl));

        // conditions:
        // if the firstIndexSamePnl > weightsLen then no prize for the user
        // if we have more users with higher pnl than the user and the weights len, then no prize for the user
        if(firstIndexSamePnl > weightslen || higherParticipants.length >= weightslen) throw { message: "OWNER_NOT_WIN" }

        return {
            position: firstIndexSamePnl,
            tiecounter: tiecounter
        }

    },

    getInfo: async function (tcId) {
        const subgraphEndpoint = 'https://api.studio.thegraph.com/query/70764/tc-perp-subgraph/version/latest'
        const query = `{
        participants(where: {competition_: {idCounter: ${tcId}}})
            {   
                owner
                percentagePnl
                isValid
                isValidDeallocate
            }
        }`;


        const { participants } = await this.postQuery(query, subgraphEndpoint);
        if (participants.length == 0) throw { message: "NO_RECORD_FOR_USER" }

        return {
            participants: participants
        }
    },

    _info: async function (owner, tcId) {
        // gets user info from subgraph
        const { participants } = await this.getInfo(tcId);
        // find position
        const { position, tiecounter } = await this.getPositionAndTieCounter(participants, owner, tcId)

        // returns outputs
        return {
            position: position,
            tiecounter: tiecounter
        }
    },

    onRequest: async function (request) {
        let { method, data: { params } } = request;

        let { owner, tcId } = params

        let result = {
            owner,
            tcId,
        }

        switch (method) {
            case 'position': {
                // gets required info
                const {
                    position,
                    tiecounter
                } = await this._info(owner, tcId);

                return Object.assign(result, { position, tiecounter })
            }
            default:
                throw { message: `invalid method ${method}` }
        }
    },

    signParams: function (request, result) {
        const {
            owner,
            tcId,
        } = result;

        const baseResult = [
            { type: 'address', value: owner },
            { type: 'uint256', value: tcId },
        ]

        switch (request.method) {
            case 'position': {
                const { position, tiecounter } = result;
                return [
                    ...baseResult,
                    { type: 'uint256', value: position },
                    { type: 'uint256', value: tiecounter },
                ]
            }
            default:
                throw { message: `Unknown method: ${request.method}` }
        }
    }
}

module.exports = ThenaTCApp
