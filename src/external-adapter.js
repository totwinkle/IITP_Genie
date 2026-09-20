class ExternalResearchAdapter {
  async search({url, id, password, query}) { throw new Error('Not implemented'); }
}
class EphemeralStubAdapter extends ExternalResearchAdapter {
  async search({url, id, password, query}) {
    if (!/^https?:\/\//i.test(url||'')) throw new Error('올바른 http(s) URL을 입력하세요.');
    if (!id || !password) throw new Error('ID와 비밀번호를 입력하세요.');
    return { provider:'로컬 데모 어댑터', authenticated:true, persisted:false, query, results:[{title:`외부 검색 시뮬레이션: ${query}`,url,summary:'실제 외부 요청 없이 어댑터 연결 흐름만 검증했습니다.'}] };
  }
}
module.exports={ExternalResearchAdapter,EphemeralStubAdapter};
