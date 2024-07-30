import { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import moment from "moment";
import { BloomFilter } from "bloomfilter";
// import { Datastore } from "@google-cloud/datastore";
import Web3, { SyncingStatusAPI } from "web3";
import prisma from "../../../lib/db";
import { sleep } from "zksync/build/utils";
const confirmations = process.env.CONFIRMATIONS || 12;
// How many concurrent blocks can it be processing? (default: 20)
const inflightLimit: number = Number(process.env.INFLIGHT_LIMIT) || 10;
const ethereumWebhook = "https://api.hanzo.io/ethereum/webhook";
const ethereumWebhookPassword =
  "3NRD2H3EbnrX4fFPBvHqUxsQjMMdVpbGXRn2jFggnq66bEEczjF3GK4r66JX3veY6WJUrxCSpB2AKsNRBHuDTHZkXBrY258tCpa4xMJPnyrCh5dZaPD5TvCC8BSHgEeMwkaN6Vgcme783fFBeS9eY88NpAgH84XbLL5W5AXahLa2ZSJy4VT8nkRVpSNPE32KGE4Jp3uhuHPUd7eKdYjrX9x8aukgQKtuyCNKdxhh4jw8ZzYZ2JUbgMmTtjduFswc";

let blockAddressQueriedAt: Date | null | any = null;

function toDatastoreArray(array: any[], type: string): { values: any[] } {
  const values = array.map((x) => {
    const y: any = {};
    y[`${type}Value`] = x;
    return y;
  });
  return { values: values };
}

async function updateBloom(bloom: any, datastore: any, network: string) {
  try {
    const query: any = {
      where: {
        Type: network,
      },
    };

    if (blockAddressQueriedAt) {
      query.where.CreatedAt = {
        gte: blockAddressQueriedAt,
      };
      console.log(
        `Checking Addresses Created After '${blockAddressQueriedAt}'`
      );
    }

    console.log(`Start Getting '${network}' Block Addresses`);

    // 执行查询
    console.log({ query });

    const results = await prisma.blockAddress.findMany(query);
    console.log("🚀 ~ updateBloom ~ results:", results);
    console.log(`Found ${results.length} Block Addresses`);

    // 更新查询时间
    blockAddressQueriedAt = moment().toDate();

    // 处理结果
    for (const result of results) {
      console.log(`Adding BlockAddress ${result.Address} to Bloom Filter`);
      bloom.add(result.Address);
    }
  } catch (error) {
    console.log(error);
  }

  // let query = datastore
  //   .createQuery("blockaddress")
  //   .filter("Type", "=", network);
  // if (blockAddressQueriedAt) {
  //   query = query.filter("CreatedAt", ">=", blockAddressQueriedAt);
  //   console.log(`Checking Addresses Created After '${blockAddressQueriedAt}'`);
  // }
  // console.log(`Start Getting '${network}' Block Addresses`);

  // const [results] = await datastore.runQuery(query);
  // console.log(`Found ${results.length} Block Addresses`);
  // blockAddressQueriedAt = moment().toDate();

  // for (const result of results) {
  //   console.log(`Adding BlockAddress ${result.Address} to Bloom Filter`);
  //   bloom.add(result.Address);
  // }
}

async function saveReadingBlock(datastore: any, network: string, result: any) {
  const createdAt = moment().toDate();
  const id = `${network}/${result.number}`;
  const data = {
    BlockID: id,
    EthereumBlockNumber: result.number,
    EthereumBlockHash: result.hash,
    EthereumBlockParentHash: result.parentHash,
    EthereumBlockNonce: result.nonce,
    EthereumBlockSha3Uncles: result.sha3Uncles,
    EthereumBlockLogsBloom: result.logsBloom,
    EthereumBlockTransactionsRoot: result.transactionsRoot,
    EthereumBlockStateRoot: result.stateRoot,
    EthereumBlockMiner: result.miner,
    EthereumBlockDifficulty: result.difficulty.toString(10),
    EthereumBlockTotalDifficulty: result.totalDifficulty.toString(10),
    EthereumBlockExtraData: result.extraData,
    EthereumBlockSize: result.size,
    EthereumBlockGasLimit: result.gasLimit,
    EthereumBlockGasUsed: result.gasUsed,
    EthereumBlockTimeStamp: result.timestamp,
    EthereumBlockUncles: "",
    Type: network,
    UpdatedAt: createdAt,
    CreatedAt: createdAt,
  };
  console.log({ result });

  try {
    const block_result = await prisma.block.create({
      data: data,
    });
  } catch (error) {
    console.error(error);
  }

  console.log(`Issuing New Block #${data.EthereumBlockNumber} Webhook Event`);
  const promise = axios
    .post(ethereumWebhook, {
      name: "block.reading",
      type: network,
      password: ethereumWebhookPassword,
      dataId: data.BlockID,
      dataKind: "block",
      data: data,
    })
    .then((result: any) => {
      console.log(
        `Successfully Issued New Block #${data.EthereumBlockNumber} Webhook Event`
      );
    })
    .catch((error: any) => {
      console.log(
        `Error Issuing New Block #${data.EthereumBlockNumber} Webhook Event:\n`,
        error
      );
    });
  return [id, data, promise];
}

async function updatePendingBlock(datastore: any, data: any): Promise<void> {
  console.log(`Updating Reading Block #'${data.Id_}' To Pending Status`);
  data.Status = "pending";
  data.UpdatedAt = moment().toDate();
  await datastore
    .save({
      key: datastore.key(["block", data.Id_]),
      data: data,
    })
    .then((result: any) => {
      console.log(
        `Pending Block #${data.EthereumBlockNumber} Updated:\n`,
        JSON.stringify(result)
      );
      console.log(
        `Issuing Pending Block #${data.EthereumBlockNumber} Webhook Event`
      );
      return axios
        .post(ethereumWebhook, {
          name: "block.pending",
          type: data.Type,
          password: ethereumWebhookPassword,
          dataId: data.Id_,
          dataKind: "block",
          data: data,
        })
        .then((result: any) => {
          console.log(
            `Successfully Issued Pending Block #${data.EthereumBlockNumber} Webhook Event`
          );
        })
        .catch((error: any) => {
          console.log(
            `Error Issuing Pending Block #${data.EthereumBlockNumber} Webhook Event:\n`,
            error
          );
        });
    })
    .catch((error: any) => {
      console.log(
        `Error Updating Reading Block #${data.EthereumBlockNumber}:\n`,
        error
      );
    });
}

async function getAndUpdateConfirmedBlock(
  datastore: any,
  network: string,
  number: number,
  confirmations: number
): Promise<void> {
  const id = `${network}/${number}`;
  const key = datastore.key(["block", id]);
  console.log(`Fetching Pending Block #'${number}'`);
  await datastore
    .get(key)
    .then((result: any) => {
      const [data] = result;
      if (!data) {
        console.log(`Pending Block #${number} Not Found`);
        return;
      }
      data.Confirmations = confirmations;
      data.UpdatedAt = moment().toDate();
      data.Status = "confirmed";
      console.log(`Updating Pending Block #${number} To Confirmed Status`);
      return datastore
        .save({
          key: key,
          data: data,
        })
        .then((result: any) => {
          console.log(
            `Confirmed Block #${data.EthereumBlockNumber} Updated:\n`,
            JSON.stringify(result)
          );
          console.log(
            `Issuing Confirmed Block #${data.EthereumBlockNumber} Webhook Event`
          );
          return axios
            .post(ethereumWebhook, {
              name: "block.confirmed",
              type: network,
              password: ethereumWebhookPassword,
              dataId: data.Id_,
              dataKind: "block",
              data: data,
            })
            .then((result: any) => {
              console.log(
                `Successfully Issued Confirmed Block #${data.EthereumBlockNumber} Webhook Event`
              );
            })
            .catch((error: any) => {
              console.log(
                `Error Issuing Confirmed Block #${data.EthereumBlockNumber} Webhook Event:\n`,
                error
              );
            });
        })
        .catch((error: any) => {
          console.log(
            `Error Saving Confirmed Block #${data.EthereumBlockNumber}:\n`,
            error
          );
        });
    })
    .catch((error: any) => {
      console.log(`Error Getting Pending Block #${number}:\n`, error);
    });
}

async function savePendingBlockTransaction(
  datastore: any,
  transaction: any,
  network: string,
  address: string,
  usage: string
): Promise<void> {
  const query = datastore
    .createQuery("blockaddress")
    .filter("Type", "=", network)
    .filter("Address", "=", address);
  console.log(`Checking If Address ${address} Is Being Watched`);
  await datastore
    .runQuery(query)
    .then((resultsAndQInfo: any) => {
      const [results, qInfo] = resultsAndQInfo;
      if (!results || !results[0]) {
        console.log(`Address ${address} Not Found:\n`, qInfo);
        return;
      }
      const createdAt = moment().toDate();
      const id = `${network}/${address}/${transaction.hash}`;
      const data = {
        Id_: id,
        EthereumTransactionHash: transaction.hash,
        EthereumTransactionNonce: transaction.nonce,
        EthereumTransactionBlockHash: transaction.blockHash,
        EthereumTransactionBlockNumber: transaction.blockNumber,
        EthereumTransactionTransactionIndex: transaction.transactionIndex,
        EthereumTransactionFrom: transaction.from,
        EthereumTransactionTo: transaction.to,
        EthereumTransactionValue: transaction.value.toString(10),
        EthereumTransactionGasPrice: transaction.gasPrice.toString(10),
        EthereumTransactionGas: transaction.gas.toString(10),
        EthereumTransactionInput: transaction.input,
        Address: address,
        Usage: usage,
        Type: network,
        Status: "pending",
        UpdatedAt: createdAt,
        CreatedAt: createdAt,
      };
      console.log(
        `Saving New Block Transaction with Id '${id}' In Pending Status`
      );
      return datastore
        .save({
          key: datastore.key(["blocktransaction", id]),
          data: data,
        })
        .then((result: any) => {
          console.log(
            `Pending Block Transaction ${transaction.hash} Saved:\n`,
            JSON.stringify(result)
          );
          console.log(
            `Issuing Pending Block Transaction ${transaction.hash} Webhook Event`
          );
          return axios
            .post(ethereumWebhook, {
              name: "blocktransaction.pending",
              type: network,
              password: ethereumWebhookPassword,
              dataId: data.Id_,
              dataKind: "blocktransaction",
              data: data,
            })
            .then((result: any) => {
              console.log(
                `Successfully Issued Pending Block Transaction ${transaction.hash} Webhook Event`
              );
            })
            .catch((error: any) => {
              console.log(
                `Error Issuing Pending Block Transaction ${transaction.hash} Webhook Event:\n`,
                error
              );
            });
        })
        .catch((error: any) => {
          console.log(
            `Error Saving New Block Transaction ${transaction.hash}:\n`,
            error
          );
        });
    })
    .catch((error: any) => {
      console.log(`Address ${address} Not Found Due to Error:\n`, error);
    });
}

async function getAndUpdateConfirmedBlockTransaction(
  web3: any,
  datastore: any,
  network: string,
  number: number,
  confirmations: number
): Promise<void> {
  const query = datastore
    .createQuery("blocktransaction")
    .filter("Type", "=", network)
    .filter("EthereumTransactionBlockNumber", "=", number);
  console.log(`Fetching Pending Block Transactions From Block #${number}`);
  await datastore
    .runQuery(query)
    .then((resultsAndQInfo: any) => {
      const [results, qInfo] = resultsAndQInfo;
      if (!results || !results.length) {
        console.log(`Block #${number} Has No Block Transactions:\n`, qInfo);
        return;
      }
      const ps = results.map((transaction: any) => {
        const id = transaction.Id_;
        const key = datastore.key(["blocktransaction", id]);
        console.log(
          `Fetching Pending Block Transaction '${transaction.EthereumTransactionHash}' Receipt`
        );
        return new Promise<void>((resolve, reject) => {
          web3.eth.getTransactionReceipt(
            transaction.EthereumTransactionHash,
            (error: any, receipt: any) => {
              console.log(error, JSON.stringify(receipt));
              if (error) {
                return reject(error);
              }
              transaction.EthereumTransactionReceiptBlockHash =
                receipt.blockHash;
              transaction.EthereumTransactionReceiptBlockNumber =
                receipt.blockNumber;
              transaction.EthereumTransactionReceiptTransactionHash =
                receipt.transactionHash;
              transaction.EthereumTransactionReceiptTransactionIndex =
                receipt.transactionIndex;
              transaction.EthereumTransactionReceiptFrom = receipt.from;
              transaction.EthereumTransactionReceiptTo = receipt.to;
              transaction.EthereumTransactionReceiptCumulativeGasUsed =
                receipt.cumulativeGasUsed;
              transaction.EthereumTransactionReceiptGasUsed = receipt.gasUsed;
              transaction.EthereumTransactionReceiptContractAddress =
                receipt.contractAddress;
              transaction.Confirmations = confirmations;
              transaction.UpdatedAt = moment().toDate();
              transaction.Status = "confirmed";
              console.log(
                `Updating Pending Block Transaction with Id '${id}' To Confirmed Status`
              );
              return resolve(
                datastore
                  .save({
                    key: key,
                    data: transaction,
                  })
                  .then((result: any) => {
                    console.log(
                      `Confirmed Block Transaction ${transaction.EthereumTransactionHash} Saved:\n`,
                      JSON.stringify(result)
                    );
                    console.log(
                      `Issuing Confirmed Block Transaction ${transaction.EthereumTransactionHash} Webhook Event`
                    );
                    return axios
                      .post(ethereumWebhook, {
                        name: "blocktransaction.confirmed",
                        type: network,
                        password: ethereumWebhookPassword,
                        dataId: transaction.Id_,
                        dataKind: "blocktransaction",
                        data: transaction,
                      })
                      .then((result: any) => {
                        console.log(
                          `Successfully Issued Confirmed Block Transaction ${transaction.EthereumTransactionHash} Webhook Event`
                        );
                      })
                      .catch((error: any) => {
                        console.log(
                          `Error Issuing Confirmed Block Transaction ${transaction.EthereumTransactionHash} Webhook Event:\n`,
                          error
                        );
                      });
                  })
                  .catch((error: any) => {
                    console.log(
                      `Error Updating Pending Block Transaction ${transaction.EthereumTransactionHash}:\n`,
                      error
                    );
                  })
              );
            }
          );
        });
      });
      return Promise.all(ps);
    })
    .catch((error: any) => {
      console.log(
        `No Block Transactions From for Block #${number} Due To Error:\n`,
        error
      );
    });
}

async function main(): Promise<void> {
  const bloom = new BloomFilter(4096 * 4096 * 2, 20);
  const projectId = "crowdstart-us";
  // const datastore = new Datastore({
  //   projectId: projectId,
  //   namespace: "_blockchains",
  // });
  const datastore = {};
  const network =
    process.env.ENVIRONMENT === "production" ? "ethereum" : "ethereum-ropsten";
  const nodeURI =
    process.env.ENVIRONMENT === "production"
      ? "http://35.193.184.247:13264"
      : "https://eth-mainnet.public.blastapi.io";

  const web3 = new Web3(new Web3.providers.HttpProvider(nodeURI));

  if (!web3.eth.net.isListening()) {
    console.log("Could Not Connect");
    console.log(
      `Are you running 'sudo geth --cache=1024 --rpc --rpcaddr 0.0.0.0 --rpcport 13264 --syncmode=fast --rpccorsdomain "*" in your geth node?'`
    );
    return;
  }

  console.log("Connecting to", nodeURI);
  console.log("Current FullBlock Is", await web3.eth.getBlockNumber());
  console.log(`Starting Reader For '${network}' Using Node '${nodeURI}'`);
  console.log("Initializing Bloom Filter");
  await updateBloom(bloom, datastore, network);
  console.log("Connected");

  let lastBlockData: any = {};

  const blockData: SyncingStatusAPI | any = await web3.eth.isSyncing();
  console.log({ blockData });

  if (lastBlockData.currentBlock !== blockData.currentBlock) {
    console.log(
      `Currently @ ${blockData.currentBlock}, Syncing From ${blockData.startingBlock} To ${blockData.highestBlock}`
    );
    lastBlockData = blockData;
  }

  // (isSynced: boolean, blockData: any) => {
  //   if (isSynced) {
  //     console.log("Syncing Complete");
  //     return;
  //   }
  // };

  let lastBlock: any = undefined;

  const latestBlock = await prisma.block.findFirst({
    where: { Type: network },
    orderBy: {
      EthereumBlockNumber: "desc",
    },
  });

  if (latestBlock) {
    lastBlock = latestBlock.EthereumBlockNumber;
    console.log(`Resuming From Block #${lastBlock}`);
  } else {
    lastBlock = "latest";
    console.log(`Resuming From 'latest'`);
  }
  console.log("Additional Query Info:\n", latestBlock);

  console.log("Start Watching For New Blocks");
  // lastBlock = 2387758;
  console.log("🚀 ~ main ~ lastBlock:", lastBlock);

  // const filter = await web3.eth.filter({
  //   fromBlock: lastBlock,
  //   toBlock: "latest",
  // });

  // web3.eth.subscribe("newBlockHeaders", (error, result) => {
  //   if (!error) {
  //     console.log("New block header:", result);
  //   } else {
  //     console.error("Error:", error);
  //   }
  // });

  let lastNumber =
    lastBlock === "latest"
      ? await web3.eth.getBlockNumber()
      : Number(web3.utils.toNumber(lastBlock)) - 1;

  let currentNumber = lastNumber;
  let blockNumber = lastNumber;
  let inflight = 0;
  console.log({
    inflight,
    inflightLimit,
    currentNumber,
    blockNumber,
    lastNumber,
  });

  const run = async () => {
    if (inflight > inflightLimit || currentNumber > blockNumber) {
      if (currentNumber > blockNumber) {
        console.log(
          `Current Number ${currentNumber} > Block Number ${blockNumber}`
        );
        currentNumber = blockNumber;
      }
      return;
    }
    console.log(
      `\nInflight Requests: ${inflight}\nCurrent Block  #${currentNumber}\nTarget Block #${blockNumber}\n`
    );
    inflight++;

    currentNumber++;

    const number = currentNumber;

    console.log(`Fetching New Block #${number}`);

    const result = await web3.eth.getBlock(number);
    console.log(`Fetched Block #${number}:\n`, result);

    if (!result) {
      console.log(
        `Block #${number} returned null, Ancient Block/Parity Issue?`
      );
      inflight--;
      return;
    }

    const [_, data, readingBlockPromise] = await saveReadingBlock(
      datastore,
      network,
      result
    );
    //   setTimeout(async () => {
    //     await updateBloom(bloom, datastore, network);
    //     for (const transaction of result.transactions) {
    //       const toAddress = transaction.to;
    //       const fromAddress = transaction.from;
    //       console.log(
    //         `Checking Addresses\nTo:  ${toAddress}\nFrom: ${fromAddress}`
    //       );
    //       if (bloom.test(toAddress)) {
    //         console.log(`Receiver Address ${toAddress}`);
    //         await savePendingBlockTransaction(
    //           datastore,
    //           transaction,
    //           network,
    //           toAddress,
    //           "receiver"
    //         );
    //       }
    //       if (bloom.test(fromAddress)) {
    //         console.log(`Sender Address ${fromAddress}`);
    //         await savePendingBlockTransaction(
    //           datastore,
    //           transaction,
    //           network,
    //           fromAddress,
    //           "sender"
    //         );
    //       }
    //     }
    //   }, 10000);

    // web3.eth.getBlock(number, true, async (error: any, result: any) => {
    // if (error) {
    //   console.log(`Error Fetching Block #${number}:\n`, error);
    //   return;
    // }
    // if (!result) {
    //   console.log(
    //     `Block #${number} returned null, Ancient Block/Parity Issue?`
    //   );
    //   inflight--;
    //   return;
    // }
    //   console.log(`Fetched Block #${result.number}`);
    //   const [_, data, readingBlockPromise] = await saveReadingBlock(
    //     datastore,
    //     network,
    //     result
    //   );
    //   setTimeout(async () => {
    //     await updateBloom(bloom, datastore, network);
    //     for (const transaction of result.transactions) {
    //       const toAddress = transaction.to;
    //       const fromAddress = transaction.from;
    //       console.log(
    //         `Checking Addresses\nTo:  ${toAddress}\nFrom: ${fromAddress}`
    //       );
    //       if (bloom.test(toAddress)) {
    //         console.log(`Receiver Address ${toAddress}`);
    //         await savePendingBlockTransaction(
    //           datastore,
    //           transaction,
    //           network,
    //           toAddress,
    //           "receiver"
    //         );
    //       }
    //       if (bloom.test(fromAddress)) {
    //         console.log(`Sender Address ${fromAddress}`);
    //         await savePendingBlockTransaction(
    //           datastore,
    //           transaction,
    //           network,
    //           fromAddress,
    //           "sender"
    //         );
    //       }
    //     }
    //   }, 10000);
    //   ((result) => {
    //     readingBlockPromise.then(() => {
    //       return new Promise<void>((resolve) => {
    //         setTimeout(() => {
    //           const confirmationBlock = result.number - confirmations;
    //           resolve(
    //             getAndUpdateConfirmedBlockTransaction(
    //               web3,
    //               datastore,
    //               network,
    //               confirmationBlock,
    //               confirmations
    //             )
    //           );
    //           inflight--;
    //         }, 12000);
    //       });
    //     });
    //   })(result);
    // });
  };

  // await run();

  setInterval(run, 1);

  function check() {
    web3.eth.getBlockNumber((error: any, n: number) => {
      if (error) {
        console.log(`Error getting blockNumber\n`, error);
        return;
      }
      blockNumber = n;
    });
  }

  // setInterval(check, 1000);
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    await main();
    res.status(200).json({ message: "Cron job executed successfully!" });
  } catch (error) {
    console.error("Error executing cron job", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
