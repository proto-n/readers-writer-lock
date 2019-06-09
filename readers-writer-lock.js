'use strict'

let locknum = 0

async function sleep(t){
	return await new Promise(r=>setTimeout(r, t))
}

async function executeAndResolve(f, resolve){
	try {
		let result = await f()
		resolve()
		return result
	} catch(e){
		resolve()
		throw e
	}
}

class Lock {
	constructor(){
		this.order = locknum++
		this.lock_promise = null
	}
	async run(f){
		let resolve = null
		let previous_lock = this.lock_promise
		this.lock_promise = new Promise((rs,rj)=>{
			resolve = rs
		})
		await previous_lock
		return await executeAndResolve(f, resolve)
	}
}

class CombinedLock {
	constructor(locks){
		this.locks = locks.sort(function(l1, l2){
			return l1.order - l2.order
		}).reverse()
	}
	async run(f){
		let work = f
		let self = this
		this.locks.forEach(function(lock, i, arr){
			let old_word = work
			work = async () => {
				return await lock.run(old_word)
			}
		})
		return await work()
	}
}

class RWLock {
	constructor(){
		this.meta_lock = new Lock()
		this.writing_promise = null
		this.reading_promises = []
	}
	async read(f){
		let resolve = null
		await this.meta_lock.run(async ()=>{
			await this.writing_promise
			this.reading_promises.push(new Promise((rs,rj)=>{
				resolve = rs
			}))
		})
		return await executeAndResolve(f, resolve)
	}
	async write(f){
		let resolve = null
		await this.meta_lock.run(async ()=>{
			await this.writing_promise
			await Promise.all(this.reading_promises)
			this.writing_promise = new Promise((rs, rj)=>{
				resolve = rs
			})
			this.reading_promises = []
		})
		return await executeAndResolve(f, resolve)
	}
}

function combine(locks){
	return new CombinedLock(locks)
}

module.exports = {
	Lock,
	CombinedLock,
	RWLock,
	sleep,
	combine,
}