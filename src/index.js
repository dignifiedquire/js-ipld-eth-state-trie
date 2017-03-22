'use strict'
/* eslint max-nested-callbacks: ["error", 5] */

const each = require('async/each')
const waterfall = require('async/waterfall')
const util = require('ipld-eth-trie/src/util.js')
const resolver = require('ipld-eth-trie/src/resolver.js')
const isExternalLink = require('ipld-eth-trie/src/common').isExternalLink
const IpldEthTxResolver = require('ipld-eth-tx').resolver
const IpfsBlock = require('ipfs-block')
const CID = require('cids')

const trieIpldFormat = 'eth-tx-trie'

exports.util = {
  deserialize: util.deserialize,
  serialize: util.serialize,
  cid: util.cid.bind(null, trieIpldFormat)
}

exports.resolver = {
  multicodec: trieIpldFormat,
  tree: tree,
  resolve: resolve
}

function resolve (block, path, callback) {
  waterfall([
    (cb) => resolver.resolve(snapIpldFormat, block, path, cb),
    (result, cb) => {
      if (isExternalLink(result.value) || result.remainderPath.length === 0) {
        return callback(null, result)
      }
      // continue to resolve on node
      const cid = new CID(1, trieIpldFormat, hash)
      let block = new IpfsBlock(result.value, cid)
      IpldEthTxResolver.resolve(block, result.remainderPath, callback)
    }
  ], callback)
}

function tree (block, options, callback) {
  exports.util.deserialize(block.data, (err, trieNode) => {
    if (err) return callback(err)
    // leaf node
    if (trieNode.type === 'leaf') {
      let block = new IpfsBlock(trieNode.getValue())
      IpldEthTxResolver.tree(block, options, (err, paths) => {
        if (err) return callback(err)
        callback(null, paths)
      })
      return
    }
    // non-leaf node
    resolver.treeFromObject(trieIpldFormat, trieNode, options, (err, result) => {
      if (err) return callback(err)
      let paths = []
      each(result, (child, next) => {
        if (Buffer.isBuffer(child.value)) {
          // node is leaf - continue to tree
          let key = child.key
          let block = new IpfsBlock(child.value)
          IpldEthTxResolver.tree(block, options, (err, subpaths) => {
            if (err) return next(err)
            subpaths.forEach((path) => {
              path.path = key + '/' + path.path
            })
            paths = paths.concat(subpaths)
          })
        } else {
          // node is non-leaf - add as is
          paths.push(child)
          next()
        }
      }, (err) => {
        if (err) return callback(err)
        callback(null, paths)
      })
    })
  })
}
