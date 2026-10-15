/* 푸터 크레딧 + 제작자 안내 모달 — 교사 콘솔(index.html)과 학생 화면(student.html)이 함께 쓴다.
 *
 * 쓰는 법: 푸터가 들어갈 자리에 <div data-credit-footer></div> 를 둔다(여러 개여도 됨). 모달은 한 번만 만들어 body 에 붙는다.
 * 모달은 순수 표시용이다: 페이지의 폼 값·대화·타이머·저장소는 읽지도 바꾸지도 않고, 열려 있는 동안 배경 스크롤만 막는다.
 * 여기 들어가는 글은 모두 고정 문구라 innerHTML 로 만들어도 안전하다(사용자·AI 텍스트는 한 글자도 섞지 않는다).
 */
(function () {
  'use strict';

  var FOOTER_HTML =
    '<footer class="credit-footer"><p>© 2026 Designed &amp; Developed by ' +
    '<button type="button" class="credit-link" aria-haspopup="dialog">두리쌤</button>. All rights reserved.</p></footer>';

  var MODAL_HTML =
    '<div class="credit-modal">' +
      '<button type="button" class="credit-close" aria-label="제작자 안내 닫기"><span class="ms">close</span></button>' +
      '<section class="credit-card">' +
        '<h2 id="creditModalTitle">✨ 제작: 두리쌤</h2>' +
        '<h3>📌 이용 조건</h3>' +
        '<ul>' +
          '<li>교육 목적으로 자유롭게 사용하실 수 있습니다.</li>' +
          '<li>재배포 시 출처(제작자 표기)를 유지해주세요.</li>' +
          '<li>코드를 임의로 수정한 버전을 다시 배포하지 말아주세요.</li>' +
          '<li>수정이 필요하시면 아래 연락처로 요청해주세요.</li>' +
        '</ul>' +
      '</section>' +
      '<section class="credit-card">' +
        '<h3>📷 문의</h3>' +
        '<ul>' +
          '<li>Instagram: <a href="https://www.instagram.com/trdoolee" target="_blank" rel="noopener noreferrer">trdoolee</a></li>' +
          '<li>Blog: <a href="https://blog.naver.com/trdoolee" target="_blank" rel="noopener noreferrer">blog.naver.com/trdoolee</a></li>' +
        '</ul>' +
        '<p class="credit-note">간단한 질문 위주로 답변드리며, 답변이 늦어질 수 있습니다.</p>' +
      '</section>' +
    '</div>';

  var modal = null;       // 모달 바깥(배경) 요소. 처음 열 때 만든다
  var opener = null;      // 닫을 때 포커스를 돌려줄 버튼
  var savedOverflow = ''; // 열기 전 body 의 overflow 값

  function isOpen() { return !!modal && modal.classList.contains('on'); }

  function build() {
    modal = document.createElement('div');
    modal.className = 'credit-back';
    modal.id = 'creditModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'creditModalTitle');
    modal.innerHTML = MODAL_HTML;
    document.body.appendChild(modal);
    modal.querySelector('.credit-close').addEventListener('click', close);
    // 배경(모달 바깥)을 눌렀을 때만 닫는다 — 모달 안쪽 클릭은 그대로 둔다
    modal.addEventListener('mousedown', function (e) { if (e.target === modal) close(); });
  }

  function open(from) {
    if (!modal) build();
    if (isOpen()) return;
    opener = from || null;
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.classList.add('on');
    modal.querySelector('.credit-close').focus();
  }

  function close() {
    if (!isOpen()) return;
    modal.classList.remove('on');
    document.body.style.overflow = savedOverflow;
    if (opener && document.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) { opener.focus(); } }
    opener = null;
  }

  // 모달이 열려 있는 동안만 반응한다: Esc 로 닫기, Tab 이 모달 밖으로 새지 않게 가두기
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var items = modal.querySelectorAll('button, a[href]');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function mount() {
    var slots = document.querySelectorAll('[data-credit-footer]');
    for (var i = 0; i < slots.length; i++) {
      slots[i].innerHTML = FOOTER_HTML;
      slots[i].querySelector('.credit-link').addEventListener('click', function (e) { open(e.currentTarget); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
