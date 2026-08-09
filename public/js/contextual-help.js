/**
 * Contextual help catalog for the SPA.
 * Keys match helpContextKey() in index.html.
 * Each entry: { title, controls:[{name,desc}], processes:[{title,steps:[]}] }
 */
(function (global) {
  "use strict";

  function page(title, controls, processes) {
    return { title: title, controls: controls || [], processes: processes || [] };
  }
  function c(name, desc) {
    return { name: name, desc: desc };
  }
  function p(title, steps) {
    return { title: title, steps: steps || [] };
  }

  var pages = {
    dash: page(
      "Tổng quan",
      [
        c("Thẻ thống kê", "Bấm vào thẻ (Nhân sự, Dự án, Công việc, Lịch hẹn, Khách hàng, Trễ hạn…) để nhảy sang trang tương ứng."),
        c("Chuyên môn", "Danh sách nhóm theo tổ. Bấm mũi tên ▸ để mở/đóng; bấm tên nhân viên để mở hồ sơ."),
        c("Thanh bận rộn", "Tỷ lệ phần trăm cho biết nhân viên đang có bao nhiêu việc so với ngưỡng cấu hình."),
        c("Gantt tiến độ dự án", "Biểu đồ thời gian các dự án đang thực hiện (nếu bạn có quyền xem tiến độ chung)."),
        c("Chuông 🔔 / Hoàn tác", "Trên header: mở nhắc hẹn hoặc hoàn tác thao tác gần đây."),
        c("Chuyển đội / phần", "Thanh Công trình tỉnh / HCM (nếu được gán nhiều đội) lọc dữ liệu theo phần đang chọn."),
      ],
      [
        p("Đọc nhanh tình hình trong ngày", [
          "Xem các thẻ thống kê ở đầu trang — số đỏ «Trễ hạn» nếu có.",
          "Mở nhóm Chuyên môn cần theo dõi, xem % bận rộn.",
          "Cuối trang xem Gantt dự án để nắm tiến độ tổng thể.",
          "Bấm thẻ hoặc tên nhân viên khi cần đi sâu.",
        ]),
      ]
    ),

    emp: page(
      "Nhân sự",
      [
        c("+ Thêm nhân sự", "Chỉ Giám đốc: mở form tạo hồ sơ (họ tên, tổ, đội tham gia, nhà, tay nghề, trạng thái…)."),
        c("Thẻ nhân viên", "Hiển thị tổ, tay nghề (sao), vị trí, số việc và danh sách công việc trên thẻ."),
        c("Thanh tên (vuốt)", "Bấm tên để xem chi tiết. Giám đốc có thể vuốt sang trái để hiện nút Sửa."),
        c("● Đang làm / Đang nghỉ", "Giám đốc thấy trạng thái chấm công trong ngày trên thẻ."),
        c("Ô việc trên thẻ", "Bấm một việc để xem phiếu giao việc nhanh."),
      ],
      [
        p("Tạo nhân sự mới", [
          "Bấm «+ Thêm nhân sự» (chỉ Giám đốc).",
          "Nhập họ tên, chọn Tổ / nhóm chuyên môn, chọn Đội tham gia (tỉnh / HCM).",
          "Nếu chọn nhóm «Chỉ huy trưởng», hệ thống cố định đội Công trình tỉnh.",
          "Chọn tỉnh nhà, tay nghề (sao), trạng thái sẵn sàng.",
          "Tên đăng nhập thường tự sinh từ họ tên — kiểm tra trước khi lưu.",
          "Bấm Lưu. Hệ thống có thể tự tạo tài khoản đăng nhập khi giám đốc đã kết nối cloud.",
          "Gán đúng đội để Điều hành / Giám sát chỉ thấy nhân sự trong phạm vi của họ.",
        ]),
      ]
    ),

    emp_det: page(
      "Chi tiết nhân sự",
      [
        c("← Quay lại", "Trở về danh sách Nhân sự (hoặc trang trước trong lịch sử điều hướng)."),
        c("Giao việc", "Điều hành / Giám đốc: giao việc trực tiếp cho nhân viên này (không dùng với Giám sát / Điều hành)."),
        c("Sửa", "Chỉ Giám đốc: sửa hồ sơ nhân sự."),
        c("Đội tham gia / Phạm vi đội", "Tick đội tỉnh / HCM — quyết định dữ liệu người này (hoặc phạm vi theo dõi) được thấy ở phần nào."),
        c("Vị trí hiện tại", "Bấm để cập nhật / xem vị trí GPS gần nhất."),
        c("Lịch Gantt / Công việc đang làm", "Hai đường Gantt và danh sách việc active/paused; có thể «Quay lại» việc tạm dừng."),
        c("Báo cáo chấm công tháng", "Giám đốc hoặc chính nhân viên: xem công tháng."),
      ],
      [
        p("Giao việc từ hồ sơ nhân sự", [
          "Mở hồ sơ nhân viên thi công (không phải Giám sát / Điều hành). Chỉ huy trưởng vẫn nhận giao việc như nhân viên thi công.",
          "Bấm «Giao việc».",
          "Nhập nội dung, thời gian, khách hàng / liên hệ nếu có.",
          "Bấm «Lưu giao việc» — việc xuất hiện trên Công việc của nhân viên và Tiến độ.",
        ]),
        p("Chỉnh đội tham gia", [
          "Chỉ Giám đốc: trong khung Đội tham gia, tick/bỏ tick đội.",
          "Thay đổi lưu ngay — ảnh hưởng phạm vi dữ liệu khi chuyển phần trên đầu trang.",
        ]),
      ]
    ),

    proj: page(
      "Dự án",
      [
        c("+ Thêm dự án", "Điều hành / Giám đốc: tạo dự án mới (tên, loại, tổ, khách hàng, thời gian…)."),
        c("Thẻ dự án", "Bấm thẻ để vào chi tiết. Vuốt tên (nếu được phép) để Sửa nhanh."),
        c("Chi tiết (nút)", "Mở trang chi tiết dự án."),
        c("Cảnh báo trễ hạn", "Banner đỏ khi có dự án / việc quá hạn kế hoạch."),
        c("Nhãn trạng thái", "Ưu tiên, loại (mới / sửa chữa), trạng thái kế hoạch (đúng hạn / trễ…)."),
      ],
      [
        p("Tạo dự án mới", [
          "Bấm «+ Thêm dự án».",
          "Điền tên, chọn tổ chuyên môn, loại (Dự án mới / Sửa chữa), ưu tiên.",
          "Gắn khách hàng (nên có sẵn toạ độ để bản đồ / gợi ý khoảng cách chính xác).",
          "Nhập ngày bắt đầu và số ngày hoàn thành — hệ thống tính ngày kết thúc.",
          "Lưu dự án, rồi vào Chi tiết → «Giao việc» để bố trí đội thi công.",
        ]),
      ]
    ),

    proj_det: page(
      "Chi tiết dự án",
      [
        c("← Quay lại", "Về danh sách dự án hoặc trang trước."),
        c("Giao việc", "Mở màn hình chọn người tham gia dự án và lưu phân công."),
        c("Sửa", "Điều hành / Giám đốc: sửa thông tin dự án."),
        c("Hoàn tất", "Giám đốc (hoặc trưởng nhóm): xác nhận đóng cả dự án — mọi thành viên còn việc được chuyển sang đã hoàn tất."),
        c("Đang làm / Hoàn thành", "Tab lọc: dự án đang làm riêng; dự án đã hoàn tất vào mục Hoàn thành (chỉ xem, đã khoá)."),
        c("Thanh tiến độ", "Tiến độ tổng hợp từ các công việc của dự án."),
        c("Đội dự án", "Danh sách người đã vào đội; badge chức vụ cạnh tên — chỉ xem trên trang này. Đổi chức vụ trong «Giao việc»."),
        c("Timeline dự án", "Nhật ký giao việc, báo cáo, đến vị trí, hoàn tất…"),
      ],
      [
        p("Giao việc / bố trí đội cho dự án", [
          "Vào Chi tiết dự án → bấm «Giao việc».",
          "Tick nhân viên theo từng tổ chuyên môn (tổ dự án được đánh dấu).",
          "Tuỳ chọn: đặt giờ có mặt tại điểm cho người mới giao; chỉnh ngày bắt đầu / hoàn thành từng người nếu cảnh báo trùng lịch.",
          "Chọn Trưởng nhóm / Thủ kho ở khối «Bố trí chức vụ» (khi đội đủ người).",
          "Bấm «Lưu giao việc». Nếu trùng lịch, chọn Dời việc mới hoặc Tạm dừng việc đang làm rồi xác nhận.",
          "Người được giao sẽ thấy việc ở tab Công việc và nhận nhắc / push (nếu đã bật).",
        ]),
        p("Hoàn tất dự án", [
          "Chỉ Giám đốc hoặc Trưởng nhóm được xác nhận hoàn tất cả dự án.",
          "Vào Chi tiết dự án → bấm «Hoàn tất» (trưởng nhóm cũng thấy nút trong Công việc của mình).",
          "Xác nhận: mọi việc còn mở của thành viên sẽ đóng; họ sẵn sàng nhận dự án khác.",
          "Nhân viên bấm «Hoàn tất phần việc» chỉ kết thúc phần của họ — không đóng cả dự án.",
        ]),
      ]
    ),

    proj_giao: page(
      "Giao việc (chỉnh đội)",
      [
        c("← Quay lại", "Huỷ màn hình giao việc, về chi tiết dự án."),
        c("Lưu giao việc", "Ghi nhận đội đã chọn = đã giao việc cho dự án."),
        c("Checkbox nhân viên", "Tick để thêm vào đội / bỏ tick để loại khỏi bố trí mới."),
        c("Bố trí chức vụ", "Gán Trưởng nhóm và Thủ kho trong những người đang chọn (lưu cùng «Lưu giao việc»)."),
        c("Giờ có mặt / lịch cá nhân", "Trên một số luồng giao việc: hẹn giờ đến công trường và chỉnh lịch từng người khi cảnh báo trùng."),
        c("Áp dụng gợi ý ngày", "Khi hệ thống đề xuất ngày bắt đầu khác để tránh trùng — bấm áp dụng."),
      ],
      [
        p("Hoàn tất giao việc", [
          "Tick đủ người cần cho từng tổ.",
          "Kiểm tra cảnh báo trùng lịch / quá tải nếu có.",
          "Chọn chức vụ (nếu cần) → «Lưu giao việc».",
          "Xử lý hộp thoại trùng lịch nếu hiện ra, rồi xác nhận.",
        ]),
      ]
    ),

    cust: page(
      "Khách hàng",
      [
        c("+ Thêm khách hàng", "Chỉ Giám đốc: tạo khách hàng mới."),
        c("Thẻ / tên khách", "Bấm để xem chi tiết. Vuốt (Giám đốc) để Sửa."),
        c("Toạ độ", "Xanh = đã có lat/lng; vàng = chưa có (ảnh hưởng bản đồ và khoảng cách gợi ý)."),
      ],
      [
        p("Thêm khách hàng mới", [
          "Bấm «+ Thêm khách hàng».",
          "Nhập tên hiển thị, địa chỉ, tỉnh, liên hệ / điện thoại.",
          "Gắn toạ độ nếu có (hoặc chọn tỉnh để ước lượng).",
          "Lưu — khách hàng có thể gắn vào dự án khi tạo / sửa dự án.",
        ]),
      ]
    ),

    cust_det: page(
      "Chi tiết khách hàng",
      [
        c("← Quay lại", "Về danh sách khách hàng."),
        c("Sửa / Xoá", "Giám đốc: chỉnh hoặc đưa vào thùng rác."),
        c("Danh sách dự án", "Các dự án gắn khách này — bấm để mở chi tiết dự án."),
      ],
      [
        p("Cập nhật thông tin khách", [
          "Mở chi tiết → Sửa.",
          "Cập nhật địa chỉ / toạ độ / liên hệ → Lưu.",
          "Kiểm tra lại trên Sơ đồ vị trí nếu cần xác nhận điểm trên bản đồ.",
        ]),
      ]
    ),

    prog: page(
      "Tiến độ công việc",
      [
        c("Gantt dự án", "Tổng quan thời gian các dự án đang chạy."),
        c("Sắp xếp lại", "Điều hành / Giám đốc: tạm chuyển người sang việc khác hoặc bàn giao phần dở."),
        c("Thanh % tiến độ", "Kéo để cập nhật % (bước 5%). Chỉ Điều hành / Giám đốc."),
        c("Hoàn thành", "Bật khi % = 100 — kết thúc công việc."),
        c("Quay lại việc này", "Với việc tạm dừng: tiếp tục làm tiếp."),
        c("Báo cáo gần đây", "Khối báo cáo tiến độ gắn với từng việc."),
      ],
      [
        p("Theo dõi và cập nhật tiến độ", [
          "Xem Gantt và danh sách Đang làm / Tạm dừng.",
          "Cập nhật % hoặc dùng «Sắp xếp lại» khi cần đổi người / bàn giao.",
          "Khi xong: kéo 100% → «Hoàn thành».",
          "Giám sát chỉ xem — không kéo % hay hoàn thành.",
        ]),
      ]
    ),

    qual: page(
      "Đánh giá & KPI",
      [
        c("Tháng / Quý / Năm", "Đổi kỳ bảng thi đua."),
        c("Ô chọn tháng", "Chọn tháng neo để tính kỳ."),
        c("Bảng KPI", "E, Q, D và điểm tổng — bấm tên nhân viên để mở hồ sơ."),
        c("+ Ghi nhận khắc phục / bảo hành", "Ghi việc khắc phục sau khi hoàn thành."),
        c("Đánh giá từng việc", "Chấm điểm / nhận xét việc đã hoàn thành."),
      ],
      [
        p("Xem và chấm KPI", [
          "Chỉ Giám đốc xem trang này (Điều hành / Giám sát không có tab Đánh giá).",
          "Chọn kỳ (tháng/quý/năm) và tháng tham chiếu.",
          "Đọc bảng xếp hạng — Giám sát / Điều hành không nằm trong bảng KPI thi đua.",
          "Cuộn xuống phần việc hoàn thành để đánh giá chất lượng từng việc.",
          "Dùng «Ghi nhận khắc phục / bảo hành» khi cần theo dõi bảo hành.",
        ]),
      ]
    ),

    hist: page(
      "Lịch sử",
      [
        c("Thao tác", "Nhật ký giao việc / thao tác gần đây."),
        c("Truy cập", "Lịch sử đăng nhập."),
        c("Thùng rác", "Mục đã xoá (giữ tối đa 30 ngày) — Khôi phục / Xoá vĩnh viễn."),
        c("↶ Hoàn tác", "Mở danh sách thao tác có thể hoàn tác (cũng có trên header)."),
      ],
      [
        p("Khôi phục mục đã xoá", [
          "Chỉ Giám đốc xem trang Lịch sử.",
          "Vào Lịch sử → Thùng rác.",
          "Bấm «Khôi phục» trước khi hết hạn 30 ngày.",
          "Hoặc «Xoá vĩnh viễn» nếu chắc không cần.",
        ]),
      ]
    ),

    lich: page(
      "Lịch hẹn",
      [
        c("← Quay lại", "Về trang trước khi mở Lịch hẹn."),
        c("+ Thêm", "Tạo nhắc hẹn (nội dung + thời gian)."),
        c("Danh sách nhắc", "Bấm để sửa; có thể xoá trong form."),
        c("Chuông header", "Lối tắt mở Lịch hẹn / xem nhắc chưa đọc."),
      ],
      [
        p("Đặt nhắc hẹn", [
          "Bấm «+ Thêm» (hoặc mở từ chuông).",
          "Nhập nội dung và thời gian nhắc → Lưu.",
          "Giám đốc: lịch công ty đồng bộ chung. Điều hành / Giám sát / NV: lịch cá nhân theo tài khoản.",
          "Khi đến giờ: thông báo / toast; bật thông báo nền nếu muốn nhắc khi không mở app.",
        ]),
      ]
    ),

    chat: page(
      "Thảo luận",
      [
        c("+ Thảo luận mới", "Chọn người (hoặc gửi tất cả nếu đủ quyền) để bắt đầu hội thoại."),
        c("Thẻ hội thoại", "Bấm để mở tin nhắn."),
        c("Vuốt trái → Xoá", "Ẩn cuộc trò chuyện đã xong khỏi danh sách (không xoá tin trên server theo nghĩa quản trị)."),
        c("📢 Gửi tất cả", "Kênh thông báo chung — chỉ hiện khi có tin và bạn có quyền xem."),
      ],
      [
        p("Bắt đầu thảo luận", [
          "Bấm «+ Thảo luận mới» → chọn người nhận.",
          "Hoặc chọn «Gửi tất cả» (Giám đốc / Điều hành) để thông báo cả đội.",
          "Nhập tin → Gửi. Người nhận cần đã có tài khoản đăng nhập.",
        ]),
      ]
    ),

    chat_det: page(
      "Chi tiết thảo luận",
      [
        c("← Quay lại", "Về danh sách thảo luận."),
        c("Ô nhập / Gửi", "Gửi tin nhắn riêng hoặc «Gửi tất cả» trên kênh broadcast."),
        c("Bong bóng tin", "Tin của bạn căn phải; tin người khác căn trái kèm tên / vai trò."),
      ],
      [
        p("Gửi tin nhắn", [
          "Gõ nội dung vào ô dưới cùng.",
          "Bấm Gửi (hoặc Enter).",
          "Nếu hiện «chưa có tài khoản» — cần giám đốc/provision để tạo tài khoản cho nhân viên đó.",
        ]),
      ]
    ),

    map: page(
      "Sơ đồ vị trí",
      [
        c("Làm mới", "Tải lại bản đồ và marker."),
        c("Icon nhà máy", "Vị trí khách hàng (theo toạ độ hoặc tỉnh)."),
        c("Chấm màu nhân viên", "Xanh = Công trình HCM, cam = Công trình tỉnh, nửa xanh–nửa cam = cả 2 đội. Viền đỏ = đang nghỉ. Bấm marker để xem popup (đội + tình trạng)."),
        c("Danh sách hiển thị", "Sơ đồ không hiển thị nhân sự nhóm Giám sát và Điều hành."),
      ],
      [
        p("Đọc bản đồ nhanh", [
          "Mở Sơ đồ → đợi tile và marker load.",
          "Bấm marker để xem tên / trạng thái / địa chỉ.",
          "Bấm «Làm mới» nếu vừa cập nhật vị trí nhân sự hoặc khách hàng.",
        ]),
      ]
    ),

    cfg: page(
      "Cài đặt",
      [
        c("Giao diện", "Đổi sáng / tối."),
        c("Thông tin công ty", "Xem hoặc (Giám đốc) sửa tên, địa chỉ, website, trường tuỳ chỉnh."),
        c("Tài khoản", "Họ tên, tuổi, tên đăng nhập, đổi mật khẩu, Đăng xuất."),
        c("Sinh trắc học", "Bật / tắt đăng nhập bằng vân tay / khuôn mặt (thiết bị hỗ trợ)."),
        c("Thông báo push / Nhắc hẹn", "Cấu hình thông báo nền và nhắc."),
        c("Trọng số gợi ý", "Giám đốc: cân gần / rảnh / tay nghề cho thuật toán gợi ý người."),
        c("Vận hành", "Cơ sở vị trí nhân viên, ngưỡng bận, ngày công chuẩn KPI."),
        c("Cloud & sao lưu", "Xuất / khôi phục dữ liệu 2 đội."),
      ],
      [
        p("Đổi mật khẩu", [
          "Mở Cài đặt → Tài khoản (hoặc Đổi mật khẩu trên portal nhân viên).",
          "Nhập mật khẩu hiện tại và mật khẩu mới (≥ 6 ký tự) → Lưu.",
        ]),
        p("Sao lưu dữ liệu (Giám đốc)", [
          "Cài đặt → Cloud & sao lưu → «Sao lưu 2 đội».",
          "Giữ file JSON an toàn. Khôi phục bằng «Khôi phục từ file» khi cần.",
        ]),
      ]
    ),

    mywork: page(
      "Công việc của tôi",
      [
        c("Banner đến vị trí", "Khi được giao việc mới có giờ có mặt — xác nhận GPS + ảnh tại chỗ."),
        c("Gantt cá nhân", "Hai đường lịch công việc của bạn."),
        c("Thẻ công việc", "Bấm để xem chi tiết: địa điểm, thời gian, đồng nghiệp, báo cáo."),
      ],
      [
        p("Nhận việc và theo dõi", [
          "Xem danh sách việc được giao và % tiến độ.",
          "Nếu có nhắc đến vị trí: làm theo banner xác nhận.",
          "Bấm thẻ việc → «Báo cáo tiến độ hôm nay» hoặc «Báo cáo hoàn thành» khi xong.",
        ]),
      ]
    ),

    mywork_det: page(
      "Chi tiết công việc",
      [
        c("← Quay lại", "Về danh sách Công việc của tôi."),
        c("Báo cáo tiến độ hôm nay", "Chuyển sang tab Báo cáo với việc này đã chọn."),
        c("Báo cáo hoàn thành", "Đánh dấu hoàn thành công việc (khi đủ điều kiện)."),
        c("Thông tin địa điểm / KH", "Nơi làm, liên hệ khách, người cùng làm."),
      ],
      [
        p("Báo cáo từ chi tiết việc", [
          "Mở việc → «Báo cáo tiến độ hôm nay».",
          "Chỉnh %, ghi chú, đính kèm ảnh → Gửi báo cáo.",
          "Khi xong hẳn: «Báo cáo hoàn thành».",
        ]),
      ]
    ),

    chamcong: page(
      "Chấm công",
      [
        c("Chấm vào / Chấm ra", "Luân phiên theo lần chấm gần nhất trong ngày — kèm ảnh và GPS."),
        c("Lịch sử trong ngày", "Các lần vào/ra đã ghi."),
        c("Nhắc chấm công", "Hệ thống nhắc quanh giờ chuẩn 08:00 / 17:00 (±10 phút)."),
      ],
      [
        p("Chấm công trong ngày", [
          "Mở tab Chấm công.",
          "Bấm Chấm vào (sáng) hoặc Chấm ra (chiều) theo nút đang hiện.",
          "Cho phép GPS, chụp đủ ảnh theo hướng dẫn trên màn hình → gửi.",
          "Quy ước: trễ/sớm >60 phút có thể tính ½ ngày; >180 phút cả ngày (xem Đánh giá / KPI).",
        ]),
      ]
    ),

    report: page(
      "Báo cáo tiến độ",
      [
        c("Chọn công việc", "Dropdown việc đang làm của bạn."),
        c("Ngày báo cáo", "Mặc định hôm nay (không chọn ngày tương lai)."),
        c("Thanh %", "Tiến độ hoàn thành gửi trong báo cáo."),
        c("Ghi chú / Ảnh", "Mô tả công việc trong ngày và ảnh hiện trường."),
        c("Gửi báo cáo", "Lưu báo cáo; gửi lại trong ngày sẽ cập nhật."),
        c("Lịch sử báo cáo", "Các lần đã gửi gần đây — chạm ảnh để xem lớn."),
      ],
      [
        p("Gửi báo cáo hàng ngày", [
          "Chọn đúng công việc trên dropdown.",
          "Kéo % phản ánh thực tế, viết ghi chú, đính ảnh nếu có.",
          "Bấm «Gửi báo cáo».",
          "Kiểm tra khối Lịch sử bên dưới để chắc đã lưu.",
        ]),
      ]
    ),

    settings: page(
      "Cài đặt (nhân viên)",
      [
        c("Giao diện", "Sáng / tối."),
        c("Thông tin công ty", "Chỉ xem thông tin công ty do giám đốc cập nhật."),
        c("Thông báo nền", "Bật nhận thông báo giao việc / nhắc khi app không mở."),
        c("Sinh trắc học", "Đăng nhập nhanh bằng sinh trắc trên thiết bị."),
        c("Đổi mật khẩu", "Đổi mật khẩu tài khoản của bạn."),
        c("Tài khoản / Đăng xuất", "Xem thông tin tài khoản và đăng xuất."),
      ],
      [
        p("Bật thông báo giao việc", [
          "Cài đặt → Thông báo nền → làm theo hướng dẫn cấp quyền trình duyệt / thiết bị.",
          "Khi giám đốc giao việc, bạn sẽ nhận push nếu token đã đăng ký thành công.",
        ]),
      ]
    ),

    _fallback: page(
      "Hướng dẫn",
      [
        c("Nút Hướng dẫn (header)", "Luôn mở trợ giúp theo đúng trang bạn đang xem."),
        c("Hai chế độ", "«Hướng dẫn» giải thích từng nút; «Quy trình» mô tả các bước thao tác chính."),
      ],
      [
        p("Dùng trợ giúp theo ngữ cảnh", [
          "Đi tới trang cần hiểu.",
          "Bấm «Hướng dẫn» cạnh phiên bản trên header.",
          "Chuyển tab «Quy trình» nếu cần làm theo từng bước.",
        ]),
      ]
    ),
  };

  function get(key) {
    return pages[key] || pages._fallback;
  }

  global.CV3_HELP = {
    pages: pages,
    get: get,
  };
})(typeof window !== "undefined" ? window : globalThis);
