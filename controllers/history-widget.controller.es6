import {Widget, Inject} from 'interstellar-core';
import _ from 'lodash';

@Widget('history', 'HistoryWidgetController', 'interstellar-basic-client/history-widget')
@Inject("$scope", "interstellar-sessions.Sessions", "interstellar-network.Server")
export default class HistoryWidgetController {
  constructor($scope, Sessions, Server) {
    if (!Sessions.hasDefault()) {
      console.error('No session. This widget should be used with active session.');
      return;
    }

    this.$scope = $scope;
    this.Server = Server;
    let session = Sessions.default;
    this.address = session.getAddress();
    this.payments = [];
    this.loading = true;
    this.showLengthLimitAlert = false;

    this.loadPayments()
      .then(() => this.setupSteaming());
  }

  loadPayments() {
    return this.Server.payments()
      .forAccount(this.address)
      .order('desc')
      .limit(100)
      .call()
      .then(payments => {
        this.payments = _.map(payments.records, payment => {
          return this._transformPaymentFields(payment);
        });

        if (this.payments.length >= 100) {
          this.showLengthLimitAlert = true;
        }
      })
      .catch(e => {
        if (e.name !== 'NotFoundError') {
          throw e;
        }
      })
      .finally(() => {
        this.loading = false;
        this.$scope.$apply();
      });
  }

  setupSteaming() {
    // Setup event stream
    let cursor;
    if (this.payments.length > 0) {
      cursor = this.payments[0].paging_token;
    } else {
      cursor = 'now';
    }

    this.Server.payments()
      .forAccount(this.address)
      .cursor(cursor)
      .stream({
        onmessage: payment => this.onNewPayment.call(this, payment)
      });
  }

  onNewPayment(payment) {
    this.payments.unshift(this._transformPaymentFields(payment));
  }

  _transformPaymentFields(payment) {
    if (payment.type === 'create_account') {
      payment.from   = payment.funder;
      payment.to     = payment.account;
      payment.amount = payment.starting_balance;
    }

    payment.direction = (payment.from === this.address) ? 'out' : 'in';
    payment.display_address = (payment.from === this.address) ? payment.to : payment.from;
    let sign = payment.direction === 'in' ? '+' : '-';
    payment.display_amount = `${sign}${payment.amount}`;

    if (payment.asset_code) {
      payment.display_asset_code = payment.asset_code;
    } else {
      payment.display_asset_code = 'XLM';
    }

    payment.link = payment._links.self.href;

    this._getMemoForPayment(payment)
      .then(memoObj => {
        payment.memo_type = memoObj.memoType;
        payment.memo = memoObj.memo;
      });

    return payment;
  }

  _getMemoForPayment(payment) {
    return payment.transaction()
      .then(transaction => {
        let memoType = transaction.memo_type;
        let memo = transaction.memo;
        return {memoType, memo};
      });
  }
}
