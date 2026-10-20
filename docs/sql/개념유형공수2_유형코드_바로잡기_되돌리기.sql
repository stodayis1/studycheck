-- 개념유형공수2_유형코드_바로잡기.sql 되돌리기 — 예전(밀린) 코드로 돌린다

begin;

-- 바꾸기 전에 줄 수 확인: 아래 update 가 각각 1줄씩, 모두 51줄이어야 한다
update public.problems set type_code = '공수2-02-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0204' and type_code = '공수2-02-05';  -- 사각형에서 중점의 활용
update public.problems set type_code = '공수2-02-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0205' and type_code = '공수2-02-06';  -- 삼각형의 내각의 이등분선
update public.problems set type_code = '공수2-02-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0206' and type_code = '공수2-02-07';  -- 삼각형의 무게중심
update public.problems set type_code = '공수2-05-02' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0502' and type_code = '공수2-05-03';  -- 중심이 직선 위에 있는 원의 방정식
update public.problems set type_code = '공수2-05-03' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0503' and type_code = '공수2-05-04';  -- x축 또는 y축에 접하는 원의 방정식
update public.problems set type_code = '공수2-05-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0504' and type_code = '공수2-05-05';  -- x축과 y축에 동시에 접하는 원의 방정식
update public.problems set type_code = '공수2-05-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0505' and type_code = '공수2-05-06';  -- 이차방정식 x²+y²+Ax+By+C=0이 나타내는 도형
update public.problems set type_code = '공수2-05-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0506' and type_code = '공수2-05-07';  -- 세 점을 지나는 원의 방정식
update public.problems set type_code = '공수2-05-07' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0507' and type_code = '공수2-05-08';  -- 두 원의 교점을 지나는 도형의 방정식
update public.problems set type_code = '공수2-05-08' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0508' and type_code = '공수2-05-09';  -- 길이의 비를 만족시키는 점이 나타내는 도형의 방정식
update public.problems set type_code = '공수2-08-03' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0803' and type_code = '공수2-08-04';  -- 선분의 길이의 합의 최솟값
update public.problems set type_code = '공수2-08-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0804' and type_code = '공수2-08-06';  -- 점에 대한 대칭이동
update public.problems set type_code = '공수2-08-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '0805' and type_code = '공수2-08-07';  -- 직선에 대한 대칭이동
update public.problems set type_code = '공수2-10-03' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1003' and type_code = '공수2-10-04';  -- 집합의 연산 조건을 만족시키는 미지수 구하기
update public.problems set type_code = '공수2-10-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1004' and type_code = '공수2-10-05';  -- 집합의 연산과 포함 관계
update public.problems set type_code = '공수2-10-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1005' and type_code = '공수2-10-06';  -- 집합의 연산 조건을 만족시키는 부분집합의 개수
update public.problems set type_code = '공수2-10-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1006' and type_code = '공수2-10-07';  -- 집합의 연산 법칙
update public.problems set type_code = '공수2-10-07' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1007' and type_code = '공수2-10-08';  -- 집합의 연산 법칙과 포함 관계
update public.problems set type_code = '공수2-10-08' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1008' and type_code = '공수2-10-09';  -- 새롭게 정의된 집합의 연산
update public.problems set type_code = '공수2-10-09' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1009' and type_code = '공수2-10-10';  -- 배수의 집합의 연산
update public.problems set type_code = '공수2-10-10' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1010' and type_code = '공수2-10-11';  -- 유한집합의 원소의 개수
update public.problems set type_code = '공수2-10-11' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1011' and type_code = '공수2-10-12';  -- 유한집합의 원소의 개수의 활용
update public.problems set type_code = '공수2-10-12' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1012' and type_code = '공수2-10-13';  -- 유한집합의 원소의 개수의 최대, 최소
update public.problems set type_code = '공수2-12-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1204' and type_code = '공수2-12-05';  -- 충분조건, 필요조건, 필요충분조건
update public.problems set type_code = '공수2-12-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1205' and type_code = '공수2-12-06';  -- 충분조건, 필요조건이 되도록 하는 상수 구하기
update public.problems set type_code = '공수2-12-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1206' and type_code = '공수2-12-07';  -- 충분조건, 필요조건과 진리집합 사이의 관계
update public.problems set type_code = '공수2-14-03' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1403' and type_code = '공수2-14-04';  -- 서로 같은 함수
update public.problems set type_code = '공수2-14-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1404' and type_code = '공수2-14-05';  -- 함수의 그래프
update public.problems set type_code = '공수2-14-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1405' and type_code = '공수2-14-06';  -- 여러 가지 함수
update public.problems set type_code = '공수2-14-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1406' and type_code = '공수2-14-07';  -- 일대일대응이 되기 위한 조건
update public.problems set type_code = '공수2-14-07' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1407' and type_code = '공수2-14-08';  -- 여러 가지 함수의 함숫값
update public.problems set type_code = '공수2-14-08' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1408' and type_code = '공수2-14-09';  -- 여러 가지 함수의 개수
update public.problems set type_code = '공수2-14-09' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1409' and type_code = '공수2-14-10';  -- 조건을 만족시키는 함수의 개수
update public.problems set type_code = '공수2-16-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1605' and type_code = '공수2-16-06';  -- 그래프를 이용하여 역함수의 함숫값 구하기
update public.problems set type_code = '공수2-16-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1606' and type_code = '공수2-16-07';  -- 역함수의 그래프의 성질
update public.problems set type_code = '공수2-17-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1704' and type_code = '공수2-17-05';  -- 유리함수의 그래프
update public.problems set type_code = '공수2-17-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1705' and type_code = '공수2-17-06';  -- 유리함수의 그래프의 평행이동
update public.problems set type_code = '공수2-17-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1706' and type_code = '공수2-17-07';  -- 유리함수의 최대, 최소
update public.problems set type_code = '공수2-17-07' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1707' and type_code = '공수2-17-08';  -- 유리함수의 그래프의 대칭
update public.problems set type_code = '공수2-17-08' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1708' and type_code = '공수2-17-09';  -- 유리함수의 식 구하기
update public.problems set type_code = '공수2-17-09' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1709' and type_code = '공수2-17-11';  -- 유리함수의 그래프와 직선의 위치 관계
update public.problems set type_code = '공수2-17-10' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1710' and type_code = '공수2-17-12';  -- 유리함수의 합성함수－fⁿ 꼴
update public.problems set type_code = '공수2-17-11' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1711' and type_code = '공수2-17-13';  -- 유리함수의 역함수
update public.problems set type_code = '공수2-18-01' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1801' and type_code = '공수2-18-02';  -- 무리식의 계산
update public.problems set type_code = '공수2-18-02' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1802' and type_code = '공수2-18-04';  -- 무리함수의 그래프
update public.problems set type_code = '공수2-18-03' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1803' and type_code = '공수2-18-05';  -- 무리함수의 그래프의 평행이동과 대칭이동
update public.problems set type_code = '공수2-18-04' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1804' and type_code = '공수2-18-06';  -- 무리함수의 최대, 최소
update public.problems set type_code = '공수2-18-05' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1805' and type_code = '공수2-18-07';  -- 무리함수의 식 구하기
update public.problems set type_code = '공수2-18-06' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1806' and type_code = '공수2-18-09';  -- 무리함수의 그래프와 직선의 위치 관계
update public.problems set type_code = '공수2-18-07' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1807' and type_code = '공수2-18-10';  -- 무리함수의 역함수
update public.problems set type_code = '공수2-18-08' where book = '개념+유형 개념편' and grade = '공통수학2' and step = '필수예제' and local_no = '1808' and type_code = '공수2-18-11';  -- 무리함수와 그 역함수의 그래프의 교점

commit;
