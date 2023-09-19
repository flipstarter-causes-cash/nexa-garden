console.log('Loading asset...')

/* Import modules. */
import formidable from 'formidable'
import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import { FsBlockstore } from 'blockstore-fs'
import moment from 'moment'
import PouchDB from 'pouchdb'
import { sha256 } from '@nexajs/crypto'

/* Initialize databases. */
const logsDb = new PouchDB(`http://${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}@127.0.0.1:5984/logs`)
// const rainmakerProfilesDb = new PouchDB(`http://${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}@127.0.0.1:5984/rainmaker_profiles`)
// const rainmakerTxsDb = new PouchDB(`http://${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}@127.0.0.1:5984/rainmaker_txs`)

/* Initialize (global) Helia. */
let helia

// console.log('process.env.HELIA_DIR', process.env.HELIA_DIR)
// const blockstore = new FsBlockstore(process.env.HELIA_DIR)
// console.log('blockstore', blockstore)

// const heliaOptions = {
//     libp2p: createLibp2p({
//         // ..other settings
//         peerDiscovery: [
//             bootstrap({
//                 list: [
//                     '/dnsaddr/bootstrap.io/p2p/QmBootstrap1',
//                     '/dnsaddr/bootstrap.io/p2p/QmBootstrap2'
//                     // etc
//                 ]
//             })
//         ]
//     })
// }

// const init = async () => {
//     helia = await createHelia({
//         blockstore,
//     })
//     console.log('helia', helia)

//     // await helia.stop()
// }

// const cleanup = async () => {
//     await helia.stop()
// }

// const getPin = async (_cid) => {
//     const fs = unixfs(helia)
//     // console.log('FS', fs);

//     const decoder = new TextDecoder()
//     let text = ''

//     for await (const chunk of fs.cat(_cid)) {
//         text += decoder.decode(chunk, {
//             stream: true
//         })
//     }

//     console.log('Added file contents:', text)

//     return text
// }

// const doPin = async (_data) => {
//     const fs = unixfs(helia)
//     // console.log('FS', fs);

//     const directoryCid = await fs.addDirectory()
//     console.log('DIR', directoryCid)

//     // we will use this TextEncoder to turn strings into Uint8Arrays
//     const encoder = new TextEncoder()
//     const bytes = encoder.encode('Hello World 201')

//     // add the bytes to your node and receive a unique content identifier
//     const cid = await fs.addBytes(bytes)
//     console.log('Added file:', cid.toString())

//     const updatedCid = await fs.cp(cid, directoryCid, 'foo.txt')
//     console.info(updatedCid)

//     return cid
// }

// init()


export default defineEventHandler(async (event) => {
    /* Initialize locals. */
    let address
    let body
    let campaign
    let campaignid
    let data
    let fields
    let files
    let form
    let options
    let profiles
    let receivers
    let response
    let txidem
    let assetPkg

    return 'working!'

    options = {
        uploadDir: process.env.UPLOAD_DIR,
        maxFieldsSize: 1 * 1024 * 1024,         //   1 MiB
        maxFileSize: 100 * 1024 * 1024,         // 100 MiB
        maxTotalFileSize: 1024 * 1024 * 1024,   //   1 GiB
        multiples: true,
    }
    // console.log('FORMIDABLE OPTIONS', options)

    /* Initialize Formidable library. */
    form = formidable(options)

    response = await form.parse(event.node.req)
        .catch(err => {
            console.error(err)

            if (err?.code === 1016) {
                return `Oops! You've exceeded the maximum file size (100 MiB).`
            }
        })
    // console.log('RESPONSE', response)

    if (!response?.length) {
        return null
    }

    data = response[1]?.data[0]

    let result = await doPin(data)
    console.log('PIN RESULT', result)
    response.push(result)

    result = await getPin(result)
    console.log('GET PIN RESULT', result)

    return response

    campaign = body.campaign
    campaignid = campaign.id

    receivers = body.receivers

    txidem = body.txidem

    profiles = receivers.map(_receiver => {
        let profileid

        profileid = sha256(`${campaignid}:${_receiver.address}`)

        return profileid
    })

    for (let i = 0; i < profiles.length; i++) {
        const profileid = profiles[i]

        const profile = await rainmakerProfilesDb
            .get(profileid)
            .catch(err => console.error(err))
        // console.log('PROFILE-1', profile)

        /* Validate profile. */
        if (profile) {
            profile.txs.push(txidem)
            profile.updatedAt = moment().unix()
            // console.log('PROFILE-2', profile)

            response = await rainmakerProfilesDb
                .put(profile)
                .catch(err => console.error(err))
            // console.log('UPDATE PROFILE', response)
        }
    }

    txPkg = {
        _id: txidem,
        campaignid,
        profiles,
        createdAt: moment().unix(),
    }
    // console.log('TX PKG', txPkg)

    response = await rainmakerTxsDb
        .put(txPkg)
        .catch(err => console.error(err))
    // console.log('RESPONSE', response)

    return txidem
})
