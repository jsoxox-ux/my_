from pathlib import Path
import streamlit as st
from rag import Index, load_folder, answer

st.set_page_config(page_title='규정 도우미', page_icon='📚', layout='wide')
st.title('📚 규정 도우미')
st.caption('내 규정 파일에서 찾고, 근거와 함께 답합니다.')

with st.sidebar:
    st.header('연결 설정')
    provider = st.selectbox('AI 모델 제공자', ['Claude', 'Gemini'])
    defaults = {'Claude': 'claude-sonnet-4-6', 'Gemini': 'gemini-2.5-flash'}
    model = st.text_input('모델 ID', value=defaults[provider], key=f'model_{provider}')
    key = st.text_input(f'{provider} API 키', type='password', key=f'key_{provider}')
    st.caption('키는 현재 세션에서만 사용하며 파일에 저장하지 않습니다. 선택한 규정 발췌와 질문이 모델 제공자에게 전송됩니다.')
    st.divider()
    st.header('규정 폴더')
    folder = st.text_input('서버의 폴더 경로', str(Path(__file__).parent / 'regulations'))
    st.caption('PDF · DOCX · TXT · MD / 하위 폴더 포함 / 파일당 25MB. PC 폴더 경로가 아닌 앱이 실행되는 서버의 경로입니다.')
    if st.button('폴더 읽기 / 새로고침', type='primary', use_container_width=True):
        try:
            with st.spinner('규정 파일을 읽고 검색 색인을 만드는 중…'):
                chunks, warnings = load_folder(folder)
                index = Index(chunks) if chunks else None
            st.session_state.index = index
            st.session_state.messages = []
            st.session_state.folder = folder
            st.session_state.warnings = warnings
            if not chunks:
                st.warning('읽을 수 있는 규정이 없습니다. 폴더에 파일을 추가하세요.')
        except Exception as exc:
            st.error(f'폴더를 읽지 못했습니다: {exc}')
    if st.button('대화 지우기', use_container_width=True):
        st.session_state.messages = []

index = st.session_state.get('index')
if index:
    st.success(f'{len({c.source for c in index.chunks})}개 파일 · {len(index.chunks)}개 발췌 검색 준비 완료')
    st.caption(f'현재 색인: {st.session_state.folder} · 파일 변경 후 새로고침하세요. 질문은 각각 독립적으로 검색합니다.')
else:
    st.info('① 규정 폴더에 파일을 넣으세요. ② 폴더 읽기를 누르세요. ③ API 키를 입력하고 질문하세요.')
for warning in st.session_state.get('warnings', []):
    st.warning(warning)


def show_sources(sources):
    if sources:
        with st.expander('검색 근거 확인', expanded=False):
            for i, (chunk, score) in enumerate(sources, 1):
                st.markdown(f'**[{i}] {chunk.source} — {chunk.location}**')
                st.text(chunk.text)
                st.caption(f'검색 유사도 {score:.3f} · 답변의 정확도를 뜻하는 수치는 아닙니다.')


for msg in st.session_state.get('messages', []):
    with st.chat_message(msg['role']):
        st.markdown(msg['content'])
        show_sources(msg.get('sources'))

question = st.chat_input('예: 휴학 신청 기간과 제출 서류를 알려주세요', disabled=not index)
if question:
    if not key.strip():
        st.warning('왼쪽에서 선택한 제공자의 API 키를 입력하세요.')
    elif len(question) > 4000:
        st.warning('질문은 4,000자 이내로 입력하세요.')
    else:
        messages = st.session_state.setdefault('messages', [])
        messages.append({'role': 'user', 'content': question})
        with st.chat_message('user'):
            st.markdown(question)
        with st.chat_message('assistant'):
            matches = index.search(question)
            try:
                with st.spinner('규정 근거를 확인하고 있습니다…'):
                    result = answer(provider, model.strip(), key.strip(), question, matches) if matches else '규정에서 관련 근거를 찾지 못했습니다. 규정의 용어로 질문하거나 관련 파일을 추가해 주세요.'
                st.markdown(result)
                show_sources(matches)
                messages.append({'role': 'assistant', 'content': result, 'sources': matches})
            except (RuntimeError, ValueError) as exc:
                st.error(str(exc))
                st.caption('설정을 확인한 뒤 질문을 다시 입력하세요.')
st.caption('AI 답변은 참고용입니다. 적용 여부와 최신 개정 내용은 원문 및 담당 부서에서 확인하세요.')
